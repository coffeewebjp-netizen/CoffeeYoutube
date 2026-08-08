using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Coffee Youtube DL Setup")]
[assembly: AssemblyCompany("Coffee Youtube DL")]
[assembly: AssemblyProduct("Coffee Youtube DL")]
[assembly: AssemblyVersion("__ASSEMBLY_VERSION__")]
[assembly: AssemblyFileVersion("__ASSEMBLY_VERSION__")]

internal static class ProductInfo
{
    internal const string Name = "Coffee Youtube DL";
    internal const string Version = "__DISPLAY_VERSION__";
    internal const string AppExeName = "CoffeeYoutubeDL.exe";
    internal const string RegistryKey = @"Software\CoffeeYoutubeDL";
    internal const string UninstallRegistryKey =
        @"Software\Microsoft\Windows\CurrentVersion\Uninstall\CoffeeYoutubeDL";
    internal const string PayloadResource = "CoffeeYoutubeDL.Payload.zip";
    internal const string UninstallerResource = "CoffeeYoutubeDL.Uninstaller.exe";
    internal const string PayloadSha256 = "__PAYLOAD_SHA256__";

    internal static string InstallDirectory
    {
        get
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "CoffeeYoutubeDL");
        }
    }

    internal static string StartMenuShortcut
    {
        get
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                "Coffee Youtube DL.lnk");
        }
    }

    internal static string DesktopShortcut
    {
        get
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "Coffee Youtube DL.lnk");
        }
    }
}

internal static class SetupProgram
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool silent = HasArgument(args, "/S") || HasArgument(args, "/silent");
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        if (silent)
        {
            try
            {
                InstallerEngine.Install(false);
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.ToString());
                return 1;
            }
        }

        Application.Run(new SetupForm());
        return 0;
    }

    private static bool HasArgument(string[] args, string expected)
    {
        foreach (string arg in args)
        {
            if (string.Equals(arg, expected, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}

internal sealed class SetupForm : Form
{
    private readonly CheckBox desktopShortcut;
    private readonly CheckBox launchAfterInstall;
    private readonly Button installButton;
    private readonly Button cancelButton;
    private readonly ProgressBar progress;
    private readonly Label statusLabel;

    internal SetupForm()
    {
        Text = "Coffee Youtube DL セットアップ";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(560, 350);
        Font = new Font("Yu Gothic UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

        Label title = new Label();
        title.Text = "Coffee Youtube DL";
        title.Font = new Font(Font.FontFamily, 22F, FontStyle.Bold);
        title.AutoSize = true;
        title.Location = new Point(34, 28);
        Controls.Add(title);

        Label description = new Label();
        description.Text =
            "YouTube / YouTube Music の動画・音楽保存ツールを、このユーザー用にインストールします。";
        description.Location = new Point(37, 83);
        description.Size = new Size(486, 42);
        Controls.Add(description);

        Label destinationTitle = new Label();
        destinationTitle.Text = "インストール先";
        destinationTitle.Font = new Font(Font, FontStyle.Bold);
        destinationTitle.AutoSize = true;
        destinationTitle.Location = new Point(37, 130);
        Controls.Add(destinationTitle);

        TextBox destination = new TextBox();
        destination.ReadOnly = true;
        destination.Text = ProductInfo.InstallDirectory;
        destination.Location = new Point(40, 153);
        destination.Size = new Size(480, 23);
        Controls.Add(destination);

        desktopShortcut = new CheckBox();
        desktopShortcut.Text = "デスクトップにショートカットを作成する";
        desktopShortcut.Checked = true;
        desktopShortcut.AutoSize = true;
        desktopShortcut.Location = new Point(40, 194);
        Controls.Add(desktopShortcut);

        launchAfterInstall = new CheckBox();
        launchAfterInstall.Text = "インストール後に Coffee Youtube DL を起動する";
        launchAfterInstall.Checked = true;
        launchAfterInstall.AutoSize = true;
        launchAfterInstall.Location = new Point(40, 222);
        Controls.Add(launchAfterInstall);

        statusLabel = new Label();
        statusLabel.Text = "バージョン " + ProductInfo.Version;
        statusLabel.Location = new Point(40, 258);
        statusLabel.Size = new Size(480, 22);
        Controls.Add(statusLabel);

        progress = new ProgressBar();
        progress.Location = new Point(40, 282);
        progress.Size = new Size(480, 8);
        progress.Style = ProgressBarStyle.Marquee;
        progress.MarqueeAnimationSpeed = 0;
        Controls.Add(progress);

        installButton = new Button();
        installButton.Text = "インストール";
        installButton.Location = new Point(332, 308);
        installButton.Size = new Size(92, 30);
        installButton.Click += InstallButtonClick;
        Controls.Add(installButton);

        cancelButton = new Button();
        cancelButton.Text = "キャンセル";
        cancelButton.Location = new Point(428, 308);
        cancelButton.Size = new Size(92, 30);
        cancelButton.Click += delegate { Close(); };
        Controls.Add(cancelButton);

        AcceptButton = installButton;
        CancelButton = cancelButton;
    }

    private async void InstallButtonClick(object sender, EventArgs e)
    {
        if (InstallerEngine.IsApplicationRunning())
        {
            DialogResult result = MessageBox.Show(
                this,
                "実行中の Coffee Youtube DL を終了して、インストールを続けますか？\n" +
                    "処理中のダウンロードがある場合はキャンセルされます。",
                "Coffee Youtube DL セットアップ",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);

            if (result != DialogResult.Yes)
            {
                return;
            }
        }

        installButton.Enabled = false;
        cancelButton.Enabled = false;
        desktopShortcut.Enabled = false;
        launchAfterInstall.Enabled = false;
        progress.MarqueeAnimationSpeed = 28;
        statusLabel.Text = "インストールしています…";

        try
        {
            bool createDesktopShortcut = desktopShortcut.Checked;
            await Task.Run(delegate { InstallerEngine.Install(createDesktopShortcut); });

            progress.MarqueeAnimationSpeed = 0;
            progress.Style = ProgressBarStyle.Blocks;
            progress.Value = 100;
            statusLabel.Text = "インストールが完了しました。";
            installButton.Text = "完了";
            installButton.Enabled = true;
            installButton.Click -= InstallButtonClick;
            installButton.Click += CompleteButtonClick;
        }
        catch (Exception error)
        {
            progress.MarqueeAnimationSpeed = 0;
            statusLabel.Text = "インストールできませんでした。";
            installButton.Enabled = true;
            cancelButton.Enabled = true;
            desktopShortcut.Enabled = true;
            launchAfterInstall.Enabled = true;

            MessageBox.Show(
                this,
                error.Message,
                "Coffee Youtube DL セットアップ",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private void CompleteButtonClick(object sender, EventArgs e)
    {
        if (launchAfterInstall.Checked)
        {
            try
            {
                Process.Start(Path.Combine(ProductInfo.InstallDirectory, ProductInfo.AppExeName));
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    this,
                    "アプリを起動できませんでした。スタートメニューから起動してください。\n\n" +
                        error.Message,
                    "Coffee Youtube DL セットアップ",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        Close();
    }
}

internal static class InstallerEngine
{
    internal static bool IsApplicationRunning()
    {
        return Process.GetProcessesByName("CoffeeYoutubeDL").Length > 0;
    }

    internal static void Install(bool createDesktopShortcut)
    {
        string installDirectory = ProductInfo.InstallDirectory;
        string parentDirectory = Path.GetDirectoryName(installDirectory);
        string operationId = Guid.NewGuid().ToString("N");
        string stagingDirectory = Path.Combine(parentDirectory, ".CoffeeYoutubeDL-install-" + operationId);
        string backupDirectory = Path.Combine(parentDirectory, ".CoffeeYoutubeDL-backup-" + operationId);
        string payloadPath = Path.Combine(Path.GetTempPath(), "CoffeeYoutubeDL-" + operationId + ".zip");
        bool previousInstallMoved = false;

        ValidateInstallDirectory(installDirectory);
        CloseRunningApplication();
        Directory.CreateDirectory(parentDirectory);

        try
        {
            WriteResourceToFile(ProductInfo.PayloadResource, payloadPath);
            VerifyPayload(payloadPath);
            ExtractZipSafely(payloadPath, stagingDirectory);

            string stagedApp = Path.Combine(stagingDirectory, ProductInfo.AppExeName);
            if (!File.Exists(stagedApp))
            {
                throw new InvalidDataException("インストールデータにアプリ本体が見つかりません。");
            }

            WriteResourceToFile(
                ProductInfo.UninstallerResource,
                Path.Combine(stagingDirectory, "Uninstall.exe"));

            if (Directory.Exists(installDirectory))
            {
                Directory.Move(installDirectory, backupDirectory);
                previousInstallMoved = true;
            }

            Directory.Move(stagingDirectory, installDirectory);

            try
            {
                CreateShortcuts(createDesktopShortcut);
                WriteRegistryEntries();
            }
            catch
            {
                if (Directory.Exists(installDirectory))
                {
                    Directory.Delete(installDirectory, true);
                }

                if (previousInstallMoved && Directory.Exists(backupDirectory))
                {
                    Directory.Move(backupDirectory, installDirectory);
                    previousInstallMoved = false;
                }

                throw;
            }

            if (previousInstallMoved && Directory.Exists(backupDirectory))
            {
                TryDeleteDirectory(backupDirectory);
            }
        }
        catch
        {
            if (previousInstallMoved &&
                Directory.Exists(backupDirectory) &&
                !Directory.Exists(installDirectory))
            {
                Directory.Move(backupDirectory, installDirectory);
            }

            throw;
        }
        finally
        {
            TryDeleteFile(payloadPath);
            TryDeleteDirectory(stagingDirectory);
        }
    }

    private static void ValidateInstallDirectory(string installDirectory)
    {
        string expected = Path.GetFullPath(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            "CoffeeYoutubeDL"));
        string actual = Path.GetFullPath(installDirectory);

        if (!string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("安全でないインストール先が指定されました。");
        }
    }

    private static void CloseRunningApplication()
    {
        Process[] processes = Process.GetProcessesByName("CoffeeYoutubeDL");
        foreach (Process process in processes)
        {
            try
            {
                if (process.CloseMainWindow() && process.WaitForExit(4000))
                {
                    continue;
                }

                process.Kill();
                process.WaitForExit(4000);
            }
            catch (InvalidOperationException)
            {
                // The process exited between enumeration and shutdown.
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    private static void WriteResourceToFile(string resourceName, string destination)
    {
        Assembly assembly = Assembly.GetExecutingAssembly();
        using (Stream input = assembly.GetManifestResourceStream(resourceName))
        {
            if (input == null)
            {
                throw new InvalidDataException("セットアップ内のリソースが見つかりません: " + resourceName);
            }

            using (FileStream output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                input.CopyTo(output);
            }
        }
    }

    private static void VerifyPayload(string payloadPath)
    {
        using (SHA256 sha256 = SHA256.Create())
        using (FileStream stream = File.OpenRead(payloadPath))
        {
            byte[] hash = sha256.ComputeHash(stream);
            string actual = BitConverter.ToString(hash).Replace("-", string.Empty);
            if (!string.Equals(actual, ProductInfo.PayloadSha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException("セットアップデータの整合性を確認できませんでした。");
            }
        }
    }

    private static void ExtractZipSafely(string archivePath, string destinationDirectory)
    {
        Directory.CreateDirectory(destinationDirectory);
        string root = Path.GetFullPath(destinationDirectory).TrimEnd(
            Path.DirectorySeparatorChar,
            Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;

        using (ZipArchive archive = ZipFile.OpenRead(archivePath))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string destinationPath = Path.GetFullPath(Path.Combine(destinationDirectory, entry.FullName));
                if (!destinationPath.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidDataException("不正なパスを含むインストールデータです。");
                }

                if (string.IsNullOrEmpty(entry.Name))
                {
                    Directory.CreateDirectory(destinationPath);
                    continue;
                }

                string destinationParent = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(destinationParent))
                {
                    Directory.CreateDirectory(destinationParent);
                }

                entry.ExtractToFile(destinationPath, true);
            }
        }
    }

    private static void CreateShortcuts(bool createDesktopShortcut)
    {
        string executable = Path.Combine(ProductInfo.InstallDirectory, ProductInfo.AppExeName);
        CreateShortcut(ProductInfo.StartMenuShortcut, executable);

        if (createDesktopShortcut)
        {
            CreateShortcut(ProductInfo.DesktopShortcut, executable);
        }
        else
        {
            TryDeleteFile(ProductInfo.DesktopShortcut);
        }
    }

    private static void CreateShortcut(string shortcutPath, string executable)
    {
        string shortcutParent = Path.GetDirectoryName(shortcutPath);
        if (!string.IsNullOrEmpty(shortcutParent))
        {
            Directory.CreateDirectory(shortcutParent);
        }

        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null)
        {
            throw new InvalidOperationException("Windows ショートカットを作成できません。");
        }

        object shell = Activator.CreateInstance(shellType);
        object shortcut = null;

        try
        {
            shortcut = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { shortcutPath });

            Type shortcutType = shortcut.GetType();
            SetShortcutProperty(shortcutType, shortcut, "TargetPath", executable);
            SetShortcutProperty(shortcutType, shortcut, "WorkingDirectory", ProductInfo.InstallDirectory);
            SetShortcutProperty(shortcutType, shortcut, "Description", ProductInfo.Name);
            SetShortcutProperty(shortcutType, shortcut, "IconLocation", executable + ",0");
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
        finally
        {
            ReleaseComObject(shortcut);
            ReleaseComObject(shell);
        }
    }

    private static void SetShortcutProperty(Type type, object shortcut, string name, string value)
    {
        type.InvokeMember(
            name,
            BindingFlags.SetProperty,
            null,
            shortcut,
            new object[] { value });
    }

    private static void ReleaseComObject(object value)
    {
        if (value != null && System.Runtime.InteropServices.Marshal.IsComObject(value))
        {
            System.Runtime.InteropServices.Marshal.FinalReleaseComObject(value);
        }
    }

    private static void WriteRegistryEntries()
    {
        string executable = Path.Combine(ProductInfo.InstallDirectory, ProductInfo.AppExeName);
        string uninstaller = Path.Combine(ProductInfo.InstallDirectory, "Uninstall.exe");

        using (RegistryKey appKey = Registry.CurrentUser.CreateSubKey(ProductInfo.RegistryKey))
        {
            appKey.SetValue("InstallLocation", ProductInfo.InstallDirectory, RegistryValueKind.String);
            appKey.SetValue("Version", ProductInfo.Version, RegistryValueKind.String);
        }

        using (RegistryKey uninstallKey = Registry.CurrentUser.CreateSubKey(ProductInfo.UninstallRegistryKey))
        {
            uninstallKey.SetValue("DisplayName", ProductInfo.Name, RegistryValueKind.String);
            uninstallKey.SetValue("DisplayVersion", ProductInfo.Version, RegistryValueKind.String);
            uninstallKey.SetValue("Publisher", "Coffee Youtube DL", RegistryValueKind.String);
            uninstallKey.SetValue("DisplayIcon", executable + ",0", RegistryValueKind.String);
            uninstallKey.SetValue("InstallLocation", ProductInfo.InstallDirectory, RegistryValueKind.String);
            uninstallKey.SetValue("UninstallString", Quote(uninstaller), RegistryValueKind.String);
            uninstallKey.SetValue("NoModify", 1, RegistryValueKind.DWord);
            uninstallKey.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            uninstallKey.SetValue("EstimatedSize", CalculateInstalledSizeKilobytes(), RegistryValueKind.DWord);
        }
    }

    private static int CalculateInstalledSizeKilobytes()
    {
        long bytes = 0;
        foreach (string file in Directory.GetFiles(ProductInfo.InstallDirectory, "*", SearchOption.AllDirectories))
        {
            bytes += new FileInfo(file).Length;
        }

        long kilobytes = (bytes + 1023L) / 1024L;
        return kilobytes > int.MaxValue ? int.MaxValue : (int)kilobytes;
    }

    private static string Quote(string value)
    {
        return "\"" + value + "\"";
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Best effort cleanup only.
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
        catch
        {
            // Best effort cleanup only.
        }
    }
}
