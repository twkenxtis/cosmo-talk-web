<h1 align="center">Cosmo Talk Web</h1>

<p align="center">
    <a href="https://twkenxtis.github.io/cosmo-talk-web/">
        <strong>在網頁上傳送訊息或查看 Cosmo Talk</strong>
    </a>
</p>

<p align="center">
    <a href="https://twkenxtis.github.io/cosmo-talk-web/">
        <img src="https://i.ibb.co/Dffv4R4g/COSMO-TALK-STATIC-2.png" alt="Cosmo Talk Web Preview" width="480" />
    </a>
    <a href="https://twkenxtis.github.io/cosmo-talk-web/">
        <img src="https://i.ibb.co/hRmyZxhq/123.png" alt="Cosmo Talk Web Preview" width="480" />
    </a>
</p>


<h2>Quick Start</h2>

<p>使用 Cosmo Talk Web 前，需要先取得一組 <strong>Cosmo 登入憑證（RefreshToken / JWT）</strong>作為登入憑證</p>

<p>請根據使用的裝置，選擇對應的方式取得憑證：</p>


<h3>透過 GAS 網頁自行登入</h3>

<p>
  <a
    id="gasLoginBtn"
    href="https://script.google.com/macros/s/AKfycby4CuBXmASIPl8uVfmZtW-u6a2atvfDqlBQ-Tu4ZnN6WIp4Db7eA8Sl3f9iN1_98wUFZQ/exec"
    target="_blank"
    rel="noopener noreferrer"
    style="
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 16px;
      text-align: center;
      text-decoration: none;
      color: #ffffff;
      background-color: #9576be;
      border: 1px solid #6d42a6;
      border-radius: 8px;
      font-weight: 600;
    "
  >
    Google Apps Script 登入方法
  </a>
</p>

<p>
  <img
    src="https://i.ibb.co/ksxNYW3d/Cosmo-Refresh-Token.png"
    alt="Google Apps Script 登入教學"
    width="480"
  />
</p>
<span>1. 完成後自行點選複製，得到憑證跳轉到 Cosmo Talk web 自行貼上</span>

<hr />

<h3>Windows — PowerShell</h3>

<p>
    <img src="https://i.ibb.co/2Y0W0n14/win.png" alt="Windows PowerShell" width="480" />
</p>

<p>開啟 PowerShell，執行以下指令：</p>

<pre><code class="language-powershell">irm https://raw.githubusercontent.com/twkenxtis/cosmo-talk-web/refs/heads/main/Cosmo_login.ps1 | iex</code></pre>

<p>按照以下步驟完成登入：</p>

<ol>
    <li>填入電子郵件地址</li>
    <li>點選 <strong>Send OTP</strong>，取得電子郵件驗證碼</li>
    <li>填入收到的 OTP Code，然後點選 <strong>Login</strong></li>
    <li>登入成功後，點選 <strong>複製（Copy RefreshToken）</strong> 按鈕取得憑證</li>
</ol>

<hr />

<h3>iOS — Shortcuts + a-Shell mini</h3>

<p>使用 iOS 捷徑搭配 <a href="https://apps.apple.com/tw/app/a-shell-mini/id1543537943">a-Shell mini</a> 取得憑證：</p>

<ol>
    <li>從 App Store 安裝 <a href="https://apps.apple.com/tw/app/a-shell-mini/id1543537943">a-Shell mini</a></li>
    <li>安裝完成後，先開啟 a-Shell mini 至少一次，再將 App 關閉</li>
    <li>
        安裝以下 iCloud Shortcut：
        <p>
            <a href="https://www.icloud.com/shortcuts/a3e96b6287674700b9e335f7a905a05e">Cosmo Login Shortcut</a>
        </p>
    </li>
    <li>
        執行捷徑，按照畫面上的指示完成操作
        <p>
            <img src="https://i.ibb.co/qLzPPzPN/IMG-9936.webp" alt="iOS Cosmo Login Shortcut" width="480" />
        </p>
    </li>
    <li>從信箱取得 OTP Code，在終端機中填入驗證碼後按下 Return</li>
    <li>完成驗證後，憑證將顯示在終端機中，手動複製即可</li>
</ol>

<hr />

<h3>Android — Termux</h3>

<ol>
    <li>
        安裝 <a href="https://play.google.com/store/apps/details?id=com.termux">Termux</a>
    </li>
    <li>
        開啟 Termux，更新套件並安裝 Python 與 Curl 執行環境：
        <pre><code class="language-bash">pkg update &amp;&amp; pkg upgrade -y
pkg install python curl -y</code></pre>
    </li>
    <li>
        執行以下指令，下載並執行登入腳本：
        <pre><code class="language-bash">curl -fsSL "https://raw.githubusercontent.com/twkenxtis/cosmo-talk-web/refs/heads/main/cosmo_login.py" -o cosmo_login.py &amp;&amp; python cosmo_login.py</code></pre>
        <p>
            <img src="https://i.ibb.co/8nYVNbpY/Screenshot-20261124-000917.png" alt="Termux Cosmo Login" width="480" />
        </p>
    </li>
    <li>按照腳本提示，依序填入電子郵件地址與收到的 OTP Code 完成驗證</li>
    <li>驗證完成後，終端機將顯示憑證，手動複製即可</li>
</ol>

<hr />

<h2>Security Notice</h2>

<p><strong>登入憑證等同帳號存取權限，請妥善保管</strong></p>

<ul>
    <li>請勿將 Token / JWT 分享給其他人</li>
    <li>請勿將 Token / JWT 放入公開的程式碼、截圖或日誌中</li>
    <li>建議將憑證儲存在安全的位置，避免外洩</li>
</ul>

<hr />

<p>取得憑證後，填入網頁中的登入欄位即可開始使用 Cosmo Talk Web</p>

<p>
    建議手機使用者將網站<strong>新增到主畫面（Add to Home Screen）</strong>，讓JWT Session保存得更久
</p>

<p>
    <a href="https://twkenxtis.github.io/cosmo-talk-web/">
        <strong>https://twkenxtis.github.io/cosmo-talk-web/</strong>
    </a>
</p>