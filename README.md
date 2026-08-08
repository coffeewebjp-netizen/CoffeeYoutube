# Coffee Youtube DL

YouTube／YouTube MusicのURLを貼り、動画または音楽としてローカル保存するWindows向けアプリです。画面録画ではなく、yt-dlpが配信ストリームを取得し、必要に応じてFFmpegで結合・変換します。

自作コンテンツ、権利者から許可を得たコンテンツなど、保存する権利があるものだけを対象にしてください。YouTube Premium Liteの公式オフラインデータを取り出すアプリではありません。

## 現在の対応範囲

- YouTube、YouTube Music、youtu.beのHTTPS URL
- 動画：互換性重視のMP4、容量効率重視のMKV
- 音楽：M4A（初期値）、元音質、MP3
- 複数の既存OpusをM4A（AAC 192kbps）へ一括変換
- 変換後のM4AをEagleへ自動登録
- プレイリスト
- 1件ずつ処理するダウンロードキュー
- 進捗、履歴、キャンセル、保存フォルダを開く操作
- Windowsアプリを最小化している間のバックグラウンド処理

NetflixなどのDRM保護サービス、画面録画、DRM回避、Eagleへの直接登録は現在の対象外です。

## Windowsアプリを使う

生成済みポータブル版は次の実行ファイルから起動します。

~~~text
dist/CoffeeYoutubeDL-win32-x64/CoffeeYoutubeDL.exe
~~~

インストーラー版は次の実行ファイルです。管理者権限は不要で、現在のユーザーだけにインストールされます。

~~~text
dist/installer/CoffeeYoutubeDL-Setup-0.1.0.exe
~~~

スタートメニューへの登録、任意のデスクトップショートカット、Windowsの「インストールされているアプリ」からのアンインストールに対応しています。上書きインストール時は既存バージョンを安全に置き換えます。アンインストールしても、ダウンロード済みの動画・音楽は削除しません。

ポータブル版はインストール不要です。ただし、実行ファイル単体ではなく CoffeeYoutubeDL-win32-x64 フォルダごと使用してください。

Windowsアプリ版の保存先は次のとおりです。

~~~text
%USERPROFILE%/Downloads/Coffee Youtube DL/Music
%USERPROFILE%/Downloads/Coffee Youtube DL/Videos
~~~

最小化や最背面の状態でもダウンロードは継続します。ブラウザ画面を再生状態にしておく必要はありません。アプリを終了すると、待機中ジョブと実行中のyt-dlp／FFmpegも停止します。

## 既存のOpusをM4Aへ変換する

Windowsアプリの「OpusをM4Aへ変換」へ .opus ファイルをドラッグ＆ドロップするか、「ファイルを選択」を押します。変換後は Music フォルダへAAC 192kbpsのM4Aとして保存されます。

- 元のOpusファイルは残します。
- 同名M4Aがある場合は連番を付け、上書きしません。
- 「変換完了後にEagleへ自動登録する」は初期状態で有効です。
- Eagleを起動しておけば、公式ローカルAPI経由でM4Aを現在のライブラリへ登録します。
- Eagle登録に失敗しても、変換済みM4AはMusicフォルダへ残ります。
- 複数ファイルを一度に選択またはドロップできます（最大100件）。
- 同時変換数は1、2、4件から選べます。初期値は2件です。
- AAC音声変換はCPU処理です。同梱FFmpegのNVENC／QSV／AMFは映像向けであり、M4AのAAC音声変換には使用できません。
- ローカルファイルの場所を安全に受け取る必要があるため、変換UIはWindowsアプリ版専用です。

## Windows版を再ビルドする

~~~powershell
npm run dist
~~~

初回は公式Electron 43.2.0のWindows x64版を取得します。梱包スクリプトは公式の SHASUMS256.txt と照合してから展開し、次をポータブル版へ同梱します。

- アプリ本体
- yt-dlp
- FFmpeg／FFprobe
- Deno

中断された取得ファイルは次回ビルド時にハッシュ検証され、不正または不完全なら再取得されます。

## Windowsインストーラーを作る

実装範囲、インストール仕様、検証内容、既知の制約は [Windowsインストーラー実装](docs/windows-installer.md) を参照してください。

~~~powershell
npm run installer
~~~

ポータブル版を作成してから、アプリ本体と同梱ツールを1つの Setup.exe にまとめます。Windows標準の .NET Framework 4.x コンパイラーを利用するため、インストーラー作成用のnpmパッケージは不要です。ポータブル版を作成済みで再利用したい場合は、次のように実行できます。

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipPortableBuild
~~~

## 開発用Web版を起動する

依存npmパッケージはありません。

~~~powershell
npm start
~~~

ブラウザで http://127.0.0.1:4317 を開きます。サーバーは外部ネットワークへ公開せず、ローカルホストだけで待ち受けます。

開発用Web版の保存先は次のとおりです。

~~~text
downloads/Music
downloads/Videos
~~~

## 容量とFFmpeg

ファイルサイズはMP4という名前ではなく、主にコーデック、解像度、ビットレート、再生時間で決まります。

- 動画・MP4：H.264/AACを優先して互換性を高くします。1080pを標準上限にしています。
- 動画・容量優先：AV1/VP9/Opusなどを選びやすくし、MKVへ格納します。機器によっては再生互換性が下がります。
- 音楽・元音質：取得できる音声ストリームを抽出し、原則として再圧縮しません。OpusまたはM4Aになります。
- 音楽・M4A：Eagleやスマホとの互換性を優先する初期値です。ソースによっては変換が発生します。
- 音楽・MP3：互換性は高い一方、FFmpegによる非可逆の再圧縮が発生します。

FFmpegは、高画質動画で別配信される映像と音声の結合、音声だけの抽出、M4A／MP3変換、メタデータ埋め込みに使います。

## ソースから動かす場合に必要なもの

- Node.js 18以上
- yt-dlp.exe
- ffmpeg.exeおよびffprobe.exe
- Deno 2.3以上、またはNode.js 22以上

実行ファイルをプロジェクト直下の tools フォルダへ置くと自動検出します。PATHに登録済みのツールも利用できます。

~~~text
CoffeeYoutubeDL/
  tools/
    yt-dlp.exe
    ffmpeg.exe
    ffprobe.exe
    deno.exe
~~~

## テスト

~~~powershell
npm test
~~~

## 安全上の実装方針

- 子プロセスは spawn と shell: false で起動し、任意のコマンド文字列を受け付けません。
- URLはYouTube、YouTube Music、youtu.beのHTTPS URLだけを許可します。
- yt-dlpのユーザー設定を読み込まず、アプリが生成した固定オプションだけを使います。
- 保存先をアプリ側で固定し、入力値によるパストラバーサルを防ぎます。
- YouTubeダウンロードは1件ずつ、Opus変換は画面で指定した1／2／4件を並列処理します。
- Windowsアプリ終了時は、実行中の子プロセスツリーも停止します。
