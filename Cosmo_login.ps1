Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -Name Win32Console -Namespace Native -MemberDefinition @"
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
"@

$consolePtr = [Native.Win32Console]::GetConsoleWindow()
if ($consolePtr -ne [IntPtr]::Zero) {
    [void][Native.Win32Console]::ShowWindow($consolePtr, 0)
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$CosmoEndpoint = "https://api.cosmo.fans"
$CosmoKey = "aUkaF3wWVltAI1QYVmxsZXfTV6L7mPTxA5+MMkLV9DE="

$PrivyEndpoint = "https://auth.privy.io"
$PrivyAppId = "cm7tt02g000a96m8uislrblbe"
$PrivyClient = "@privy-io/js-sdk-core:0.60.7.0.1"
$UserAgent = "okhttp/4.12.0"

$NoSubscriptionMsg = "No active Cosmo Talk subscription"
$EmailPattern = "^[^@\s]+@[^@\s]+\.[^@\s]+$"

function Protect-AesCbc {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Plaintext,
        [Parameter(Mandatory = $true)]
        [string]$KeyBase64
    )

    $keyBytes = [Convert]::FromBase64String($KeyBase64)
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($Plaintext)

    $aes = New-Object System.Security.Cryptography.AesManaged
    try {
        $aes.KeySize = $keyBytes.Length * 8
        $aes.BlockSize = 128
        $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
        $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
        $aes.Key = $keyBytes
        $aes.GenerateIV()
        $ivBytes = $aes.IV

        $encryptor = $aes.CreateEncryptor()
        try {
            $cipherBytes = $encryptor.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
        }
        finally {
            $encryptor.Dispose()
        }

        $combined = New-Object byte[] ($ivBytes.Length + $cipherBytes.Length)
        [Array]::Copy($ivBytes, 0, $combined, 0, $ivBytes.Length)
        [Array]::Copy($cipherBytes, 0, $combined, $ivBytes.Length, $cipherBytes.Length)

        return [Convert]::ToBase64String($combined)
    }
    finally {
        $aes.Dispose()
    }
}

function Get-PrivyHeaders {
    return @{
        "privy-app-id" = $PrivyAppId
        "privy-client" = $PrivyClient
        "privy-ca-id"  = ([guid]::NewGuid().ToString())
        "Origin"       = $PrivyEndpoint
        "Content-Type" = "application/json"
        "Accept"       = "application/json"
        "User-Agent"   = $UserAgent
    }
}

function Resolve-ApiErrorMessage {
    param(
        [string]$RawBody
    )

    if ([string]::IsNullOrWhiteSpace($RawBody)) {
        return ""
    }

    try {
        $parsed = $RawBody | ConvertFrom-Json -ErrorAction Stop
        if ($null -ne $parsed -and ($parsed.PSObject.Properties.Name -contains "error") -and $null -ne $parsed.error) {
            $err = $parsed.error
            if ($err -is [PSCustomObject]) {
                $hasCode = $err.PSObject.Properties.Name -contains "code" -and $err.code
                $hasMsg = $err.PSObject.Properties.Name -contains "message" -and $err.message
                if ($hasCode -and $err.code -eq "USER_NOT_FOUND") {
                    return $NoSubscriptionMsg
                }
                if ($hasCode -and $hasMsg) {
                    return "$($err.code): $($err.message)"
                }
                if ($hasMsg) {
                    return [string]$err.message
                }
                if ($hasCode) {
                    return [string]$err.code
                }
            }
            else {
                $errStr = [string]$err
                if ($errStr -like "*USER_NOT_FOUND*") {
                    return $NoSubscriptionMsg
                }
                return $errStr
            }
        }
    }
    catch {
    }

    if ($RawBody -like "*USER_NOT_FOUND*") {
        return $NoSubscriptionMsg
    }

    return $RawBody
}

function Invoke-JsonPost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [string]$BodyJson,
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers
    )

    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($BodyJson)
    try {
        return Invoke-RestMethod -Uri $Uri -Method Post -Headers $Headers -Body $bodyBytes -TimeoutSec 20
    }
    catch {
        $rawErr = ""
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $rawErr = [string]$_.ErrorDetails.Message
        }
        elseif ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
                    try {
                        $rawErr = $reader.ReadToEnd()
                    }
                    finally {
                        $reader.Dispose()
                    }
                }
            }
            catch {}
        }

        $detail = Resolve-ApiErrorMessage -RawBody $rawErr
        if ($detail -eq $NoSubscriptionMsg) {
            throw $NoSubscriptionMsg
        }
        if ($detail) {
            throw "$($_.Exception.Message) | $detail"
        }
        throw $_.Exception.Message
    }
}

function Find-TokenValue {
    param(
        [object]$Node,
        [string]$CamelName,
        [string]$SnakeName
    )

    if ($null -eq $Node) {
        return $null
    }

    if ($Node -is [System.Collections.IDictionary]) {
        if ($Node.Contains($CamelName) -and $Node[$CamelName]) {
            return $Node[$CamelName]
        }
        if ($Node.Contains($SnakeName) -and $Node[$SnakeName]) {
            return $Node[$SnakeName]
        }
        foreach ($val in $Node.Values) {
            $found = Find-TokenValue -Node $val -CamelName $CamelName -SnakeName $SnakeName
            if ($null -ne $found) {
                return $found
            }
        }
        return $null
    }

    if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
        foreach ($item in $Node) {
            $found = Find-TokenValue -Node $item -CamelName $CamelName -SnakeName $SnakeName
            if ($null -ne $found) {
                return $found
            }
        }
        return $null
    }

    if ($Node -is [PSCustomObject]) {
        foreach ($prop in $Node.PSObject.Properties) {
            if (($prop.Name -eq $CamelName -or $prop.Name -eq $SnakeName) -and $prop.Value) {
                return $prop.Value
            }
        }
        foreach ($prop in $Node.PSObject.Properties) {
            $found = Find-TokenValue -Node $prop.Value -CamelName $CamelName -SnakeName $SnakeName
            if ($null -ne $found) {
                return $found
            }
        }
    }

    return $null
}

function Get-CredentialsFromResponse {
    param(
        [Parameter(Mandatory = $true)]
        [object]$ResponseObj
    )

    $access = Find-TokenValue -Node $ResponseObj -CamelName "accessToken" -SnakeName "access_token"
    $refresh = Find-TokenValue -Node $ResponseObj -CamelName "refreshToken" -SnakeName "refresh_token"

    if (-not $access -or -not $refresh) {
        throw "could not find accessToken/refreshToken in response"
    }

    return @{
        accessToken  = [string]$access
        refreshToken = [string]$refresh
    }
}

function Send-CosmoOtp {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetEmail
    )

    $trimmed = $TargetEmail.Trim()
    if (-not ($trimmed -match $EmailPattern)) {
        throw "Invalid email format: $trimmed"
    }

    $payload = @{ email = $trimmed } | ConvertTo-Json -Compress
    $null = Invoke-JsonPost -Uri "$PrivyEndpoint/api/v1/passwordless/init" -BodyJson $payload -Headers (Get-PrivyHeaders)
}

function Invoke-VerifyOtpAndLogin {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetEmail,
        [Parameter(Mandatory = $true)]
        [string]$OtpCode
    )

    $cleanEmail = $TargetEmail.Trim()
    $cleanCode = $OtpCode.Trim()

    if (-not ($cleanEmail -match $EmailPattern)) {
        throw "Invalid email format: $cleanEmail"
    }
    if (-not $cleanCode -or $cleanCode.Length -gt 6) {
        throw "OTP code must be 1 to 6 characters"
    }

    $privyBody = @{
        email = $cleanEmail
        code  = $cleanCode
        mode  = "login-or-sign-up"
    } | ConvertTo-Json -Compress

    $privyResp = Invoke-JsonPost -Uri "$PrivyEndpoint/api/v1/passwordless/authenticate" -BodyJson $privyBody -Headers (Get-PrivyHeaders)

    $privyToken = if (($privyResp.PSObject.Properties.Name -contains "token") -and $privyResp.token) {
        [string]$privyResp.token
    }
    elseif (($privyResp.PSObject.Properties.Name -contains "privy_access_token") -and $privyResp.privy_access_token) {
        [string]$privyResp.privy_access_token
    }
    else {
        ""
    }

    if (-not $privyToken) {
        throw "Privy did not return an access token"
    }

    $tokenJson = @{ token = $privyToken } | ConvertTo-Json -Compress
    $encryptedPayload = Protect-AesCbc -Plaintext $tokenJson -KeyBase64 $CosmoKey

    $cosmoHeaders = @{
        "Content-Type"      = "text/plain"
        "x-cosmo-encrypted" = "1"
        "User-Agent"        = $UserAgent
    }

    $account = Invoke-JsonPost -Uri "$CosmoEndpoint/bff/v3/users/login-by-privy" -BodyJson $encryptedPayload -Headers $cosmoHeaders
    $creds = Get-CredentialsFromResponse -ResponseObj $account

    return @{
        account     = $account
        credentials = $creds
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "COSMO Login"
$form.Size = New-Object System.Drawing.Size(480, 340)
$form.MinimumSize = New-Object System.Drawing.Size(420, 300)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

$lblEmail = New-Object System.Windows.Forms.Label
$lblEmail.Text = "Email:"
$lblEmail.Location = New-Object System.Drawing.Point(16, 18)
$lblEmail.Size = New-Object System.Drawing.Size(65, 24)
$form.Controls.Add($lblEmail)

$txtEmail = New-Object System.Windows.Forms.TextBox
$txtEmail.Location = New-Object System.Drawing.Point(86, 15)
$txtEmail.Size = New-Object System.Drawing.Size(260, 26)
$form.Controls.Add($txtEmail)

$btnSendOtp = New-Object System.Windows.Forms.Button
$btnSendOtp.Text = "Send OTP"
$btnSendOtp.Location = New-Object System.Drawing.Point(354, 14)
$btnSendOtp.Size = New-Object System.Drawing.Size(96, 28)
$form.Controls.Add($btnSendOtp)

$lblCode = New-Object System.Windows.Forms.Label
$lblCode.Text = "OTP Code:"
$lblCode.Location = New-Object System.Drawing.Point(16, 56)
$lblCode.Size = New-Object System.Drawing.Size(65, 24)
$form.Controls.Add($lblCode)

$txtCode = New-Object System.Windows.Forms.TextBox
$txtCode.Location = New-Object System.Drawing.Point(86, 53)
$txtCode.Size = New-Object System.Drawing.Size(260, 26)
$form.Controls.Add($txtCode)

$btnLogin = New-Object System.Windows.Forms.Button
$btnLogin.Text = "Login"
$btnLogin.Location = New-Object System.Drawing.Point(354, 52)
$btnLogin.Size = New-Object System.Drawing.Size(96, 28)
$form.Controls.Add($btnLogin)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "Status: Enter email and send OTP"
$lblStatus.Location = New-Object System.Drawing.Point(16, 90)
$lblStatus.Size = New-Object System.Drawing.Size(434, 22)
$form.Controls.Add($lblStatus)

$lblWarning = New-Object System.Windows.Forms.Label
$lblWarning.Text = "WARNING: Never publicly share or disclose your Refresh Token!"
$lblWarning.Location = New-Object System.Drawing.Point(16, 108)
$lblWarning.Size = New-Object System.Drawing.Size(434, 22)
$lblWarning.ForeColor = [System.Drawing.Color]::Red
$lblWarning.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($lblWarning)

$txtOutput = New-Object System.Windows.Forms.TextBox
$txtOutput.Location = New-Object System.Drawing.Point(16, 136)
$txtOutput.Size = New-Object System.Drawing.Size(434, 110)
$txtOutput.Multiline = $true
$txtOutput.ReadOnly = $true
$txtOutput.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$txtOutput.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($txtOutput)

$btnCopy = New-Object System.Windows.Forms.Button
$btnCopy.Text = "Copy Refresh Token"
$btnCopy.Location = New-Object System.Drawing.Point(16, 256)
$btnCopy.Size = New-Object System.Drawing.Size(140, 30)
$btnCopy.Enabled = $false
$form.Controls.Add($btnCopy)

$btnSendOtp.Add_Click({
    $btnSendOtp.Enabled = $false
    $btnLogin.Enabled = $false
    try {
        $emailVal = $txtEmail.Text.Trim()
        Send-CosmoOtp -TargetEmail $emailVal
        $lblStatus.Text = "Status: OTP sent to $emailVal"
    }
    catch {
        $lblStatus.Text = "Status: Send OTP failed"
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }
    finally {
        $btnSendOtp.Enabled = $true
        $btnLogin.Enabled = $true
    }
})

$btnLogin.Add_Click({
    $btnSendOtp.Enabled = $false
    $btnLogin.Enabled = $false

    try {
        $emailVal = $txtEmail.Text.Trim()
        $codeVal = $txtCode.Text.Trim()

        $result = Invoke-VerifyOtpAndLogin -TargetEmail $emailVal -OtpCode $codeVal

        $refreshToken = $null

        if (
            $result.account -and
            ($result.account.PSObject.Properties.Name -contains "credentials") -and
            $result.account.credentials
        ) {
            $refreshToken = $result.account.credentials.refreshToken
        }

        if (-not $refreshToken -and $result.credentials) {
            $refreshToken = $result.credentials.refreshToken
        }

        if ([string]::IsNullOrWhiteSpace([string]$refreshToken)) {
            throw "Login succeeded, but refreshToken was not found"
        }

        $txtOutput.Text = [string]$refreshToken
        $btnCopy.Enabled = $true

        $lblStatus.Text = "Status: Login succeeded"
    }
    catch {
        $txtOutput.Clear()
        $btnCopy.Enabled = $false

        $lblStatus.Text = "Status: Login failed"

        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            "Error",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
    finally {
        $btnSendOtp.Enabled = $true
        $btnLogin.Enabled = $true
    }
})

$btnCopy.Add_Click({
    if (-not [string]::IsNullOrWhiteSpace($txtOutput.Text)) {
        [System.Windows.Forms.Clipboard]::SetText($txtOutput.Text)
        $lblStatus.Text = "Status: Refresh Token copied to clipboard"
    }
})

[void]$form.ShowDialog()