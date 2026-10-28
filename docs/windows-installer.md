# Windowsインストーラー実装

## 対象バージョン

この文書は Coffee Youtube DL 0.1.2 のWindowsインストーラー実装を説明します。

生成物は次の場所に出力されます。

~~~text
dist/0.1.2/installer/CoffeeYoutubeDL-Setup-0.1.2.exe
~~~

`dist` と `build-cache` はGit管理対象外です。配布する場合は、ビルド後のSetup.exeを別途リリースへ添付してください。

## 今回の修正範囲

- ポータブル版を単一のSetup.exeへまとめるビルド処理を追加
- 管理者権限を要求しない、ユーザー単位のインストールに対応
- スタートメニューと任意のデスクトップショートカットを作成
- Windowsの「インストールされているアプリ」へアンインストール情報を登録
- 既存バージョンを退避してから置き換える上書き更新と、失敗時のロールバックを実装
- 埋め込みZIPのSHA-256検証と、展開先外への書き込みを防ぐパス検証を実装
- アプリ終了後にインストール先を削除する自己退避型アンインストーラーを実装
- GUIを使わない導入・削除用に `/S` と `/silent` を実装
- Windows実行マニフェストを追加し、SideBySide起動エラーを修正
- npmスクリプト、README、ビルド手順を更新
- ポータブル版とインストーラーをバージョン別 `dist/0.1.2` に出力し、直前版を上書きしない

アンインストールではアプリ本体、ショートカット、アンインストール登録を削除します。ユーザーがダウンロードした動画・音楽は削除しません。

## インストール仕様

| 項目 | 内容 |
| --- | --- |
| 対応OS | Windows 10／11 x64 |
| インストール範囲 | 現在のユーザー |
| 管理者権限 | 不要 |
| インストール先 | `%LOCALAPPDATA%\Programs\CoffeeYoutubeDL` |
| スタートメニュー | `Coffee Youtube DL` |
| デスクトップ | セットアップ画面で選択可能 |
| アンインストール | Windows設定、またはインストール先の `Uninstall.exe` |
| サイレントインストール | `CoffeeYoutubeDL-Setup-0.1.2.exe /S` |
| サイレントアンインストール | `Uninstall.exe /S` |

インストール中に実行中のCoffee Youtube DLを検出した場合、GUIでは終了確認を表示します。サイレント実行では確認なしで終了させます。処理中のダウンロードがある状態で更新しないでください。

## 実装ファイル

| ファイル | 役割 |
| --- | --- |
| `scripts/build-installer.ps1` | ポータブル版の圧縮、ハッシュ計算、C#コンパイル、Setup.exe生成 |
| `scripts/installer/Installer.cs` | セットアップ画面、展開、更新、ショートカット、レジストリ登録 |
| `scripts/installer/Uninstaller.cs` | アプリ終了、ショートカットと登録情報の削除、アプリ本体の削除 |
| `scripts/installer/app.manifest` | 権限レベル、Windows互換性、DPI設定 |
| `scripts/package-windows.ps1` | Electronポータブル版の生成 |
| `package.json` | `npm run installer` の登録 |

インストーラーとアンインストーラーはWindows標準の.NET Framework 4.x C#コンパイラーで生成します。インストーラー専用のnpm依存パッケージはありません。

## ビルド

ポータブル版から続けてインストーラーを生成します。

~~~powershell
npm run installer
~~~

既存のポータブル版を再利用する場合は、次を実行します。

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipPortableBuild
~~~

ビルド成功時にはSetup.exeのパス、サイズ、SHA-256が表示されます。

## 検証内容

0.1.2のパッケージで次を確認しました。

- `npm test`: 17テスト成功
- Electron 43.8.4のWindows x64アーカイブを公式 `SHASUMS256.txt` と照合
- 生成したポータブル実行ファイルをNodeモードで起動し、`process.versions` がElectron 43.8.4／Node.js 24.22.1であることを確認
- インストーラー内のZIPペイロードとビルドしたポータブルアプリの一致をSHA-256で確認
- インストーラーとアンインストーラーのC#コンパイル成功
- Setup.exe内のペイロードとビルド元ZIPのSHA-256一致
- ペイロード内にアプリ本体、yt-dlp、FFmpeg、FFprobe、Denoが存在
- 既存の `app.manifest` を指定したインストーラー／アンインストーラーのコンパイル成功

実ユーザー領域へ書き込むインストール／アンインストールの自動実行は、安全上の理由から検証手順に含めていません。この0.1.2検証では、既存のインストール済みアプリを置き換えていません。
0.1.2では最終Setup.exeからRT_MANIFESTリソースを抽出し、Windows SDKの `mt.exe -validate_manifest` で検証しました。Setup.exe自体は起動していません。0.1.1の実装時に行ったマニフェスト検証は当時の記録です。

0.1.2のビルド記録:

- Electron公式Windows x64アーカイブ `electron-v43.8.4-win32-x64.zip`: 151,289,398 bytes、SHA-256 `C9974747EE3FEEB338BE107D431EB7E53D4A3F37A6FD9AF85F7AE554CD9385B8`。ダウンロードしたアーカイブは公式 `SHASUMS256.txt` の値と一致しました。
- ポータブル版 `dist/0.1.2/CoffeeYoutubeDL-win32-x64/CoffeeYoutubeDL.exe`: 239,181,312 bytes、SHA-256 `044280E7AE08D1CBB29DF983C5BBA08AEB134FD9FE700C617EBECC18BF3849AF`。
- インストーラー `dist/0.1.2/installer/CoffeeYoutubeDL-Setup-0.1.2.exe`: 271,446,016 bytes、SHA-256 `C3B4F2BA736407FAB1EAA1EAEEF0196EDC79DD29BD44581EBB5641727096483D`。未署名です。
- Setup内のZIPリソースと生成したペイロードは同じSHA-256 `6CC48CA11FA5DD8353DA28C4D51E6D38E1A9E4F66CE74E53CC894DF66C3E4897` で、Setup内CoffeeYoutubeDL.exeのSHA-256もポータブル版と一致しました。
- ポータブル版を `ELECTRON_RUN_AS_NODE=1` でヘッドレス実行した `process.versions` は Electron `43.8.4`、Node.js `24.22.1`、Chromium `150.0.7871.250` でした。

## SideBySideエラーの修正

初回生成物では、埋め込みマニフェストのXML属性を囲む引用符が欠落していました。Windowsはアプリ本体を実行する前にマニフェストを解析するため、この不正なXMLによって「サイド バイ サイド構成が正しくない」という起動エラーが発生しました。

0.1.1の修正では、`scripts/installer/app.manifest` の属性を正しいXML形式へ修正し、Windows Manifest Toolの `-validate_manifest` で最終Setup.exeに埋め込まれた内容を検証しました。0.1.2でも同じマニフェストを指定してC#コンパイルが成功し、最終Setup.exeに埋め込まれたRT_MANIFESTも検証しました。

## 既知の制約

- コード署名証明書を使用していないため、Windows SmartScreenの警告が表示される場合があります。
- 現在の配布対象はWindows x64だけです。
- Setup.exeはElectron本体と各種ツールを含むため、ファイルサイズが大きくなります。
- インストーラーのビルドには.NET Framework 4.xのC#コンパイラーが必要です。
- yt-dlp、FFmpeg、Deno、Electronを更新した場合は、ポータブル版からインストーラーを再生成してください。
- Electron 43.8.4はNode.js 24.22.1を含み、2026年10月21日のNode.js 24系列のセキュリティ修正版を同梱しています（[Electron release notes](https://github.com/electron/electron/releases/tag/v43.8.4)、[Node.js 24.22.1 release](https://nodejs.org/en/blog/release/v24.22.1)）。以前の43.8.3以前のビルドはこの修正を含みません。
