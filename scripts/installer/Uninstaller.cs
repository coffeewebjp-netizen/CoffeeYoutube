using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class UninstallProductInfo
{
    internal const string RegistryKey = @"Software\CoffeeYoutubeDL";
    internal const string UninstallRegistryKey =
        @"Software\Microsoft\Windows\CurrentVersion\Uninstall\CoffeeYoutubeDL";

    internal static string ExpectedInstallDirectory
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

internal static class UninstallerProgram
{
    private const int MoveFileDelayUntilReboot = 0x4;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        bool silent = HasArgument(args, "/S") || HasArgument(args, "/silent");
        int fromTempIndex = FindArgument(args, "/fromtemp");

        if (fromTempIndex >= 0 && fromTempIndex + 1 < args.Length)
        {
            return RunFromTemporaryCopy(args[fromTempIndex + 1], silent);
        }

        string installDirectory = Path.GetDirectoryName(Application.ExecutablePath);
        if (!IsExpectedInstallDirectory(installDirectory))
        {
            ShowError(silent, "安全でないアンインストール先が指定されました。");
            return 1;
        }

        if (!silent)
        {
            DialogResult confirmation = MessageBox.Show(
                "Coffee Youtube DL をアンインストールしますか？\n\n" +
                    "ダウンロード済みの動画・音楽は削除されません。",
                "Coffee Youtube DL アンインストール",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);

            if (confirmation != DialogResult.Yes)
            {
                return 0;
            }
        }

        try
        {
            string temporaryUninstaller = Path.Combine(
                Path.GetTempPath(),
                "CoffeeYoutubeDL-Uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(Application.ExecutablePath, temporaryUninstaller, true);

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = temporaryUninstaller;
            startInfo.Arguments = "/fromtemp " + Quote(installDirectory) + (silent ? " /S" : string.Empty);
            startInfo.WorkingDirectory = Path.GetTempPath();
            startInfo.UseShellExecute = false;
            Process.Start(startInfo);
            return 0;
        }
        catch (Exception error)
        {
            ShowError(silent, "アンインストーラーを開始できませんでした。\n\n" + error.Message);
            return 1;
        }
    }

    private static int RunFromTemporaryCopy(string installDirectory, bool silent)
    {
        if (!IsExpectedInstallDirectory(installDirectory))
        {
            ShowError(silent, "安全でないアンインストール先が指定されました。");
            return 1;
        }

        Thread.Sleep(600);

        try
        {
            CloseRunningApplication();
            TryDeleteFile(UninstallProductInfo.StartMenuShortcut);
            TryDeleteFile(UninstallProductInfo.DesktopShortcut);

            Registry.CurrentUser.DeleteSubKeyTree(UninstallProductInfo.RegistryKey, false);
            Registry.CurrentUser.DeleteSubKeyTree(UninstallProductInfo.UninstallRegistryKey, false);

            DeleteInstallDirectoryWithRetry(installDirectory);

            if (!silent)
            {
                MessageBox.Show(
                    "Coffee Youtube DL をアンインストールしました。\n" +
                        "ダウンロード済みの動画・音楽は残しています。",
                    "Coffee Youtube DL アンインストール",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }

            MoveFileEx(Application.ExecutablePath, null, MoveFileDelayUntilReboot);
            return 0;
        }
        catch (Exception error)
        {
            ShowError(silent, "アンインストールできませんでした。\n\n" + error.Message);
            MoveFileEx(Application.ExecutablePath, null, MoveFileDelayUntilReboot);
            return 1;
        }
    }

    private static bool IsExpectedInstallDirectory(string path)
    {
        if (string.IsNullOrEmpty(path))
        {
            return false;
        }

        string expected = Path.GetFullPath(UninstallProductInfo.ExpectedInstallDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string actual = Path.GetFullPath(path)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);
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

    private static void DeleteInstallDirectoryWithRetry(string installDirectory)
    {
        Exception lastError = null;

        for (int attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                if (Directory.Exists(installDirectory))
                {
                    Directory.Delete(installDirectory, true);
                }

                return;
            }
            catch (Exception error)
            {
                lastError = error;
                Thread.Sleep(500);
            }
        }

        throw new IOException("アプリのフォルダーを削除できませんでした。", lastError);
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
            // Continue uninstalling if an optional shortcut cannot be deleted.
        }
    }

    private static void ShowError(bool silent, string message)
    {
        if (silent)
        {
            Console.Error.WriteLine(message);
        }
        else
        {
            MessageBox.Show(
                message,
                "Coffee Youtube DL アンインストール",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static int FindArgument(string[] args, string expected)
    {
        for (int index = 0; index < args.Length; index++)
        {
            if (string.Equals(args[index], expected, StringComparison.OrdinalIgnoreCase))
            {
                return index;
            }
        }

        return -1;
    }

    private static bool HasArgument(string[] args, string expected)
    {
        return FindArgument(args, expected) >= 0;
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}
