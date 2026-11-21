param(
  [string]$Title = "CONCEPTUS - Klasor Sec",
  [string]$InitialDir = "",
  [switch]$TestCompile
)

$ErrorActionPreference = "Stop"

$code = @"
using System;
using System.Runtime.InteropServices;

public static class ModernFolderPicker {
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialog {}

    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int alignment);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    public static string Pick(string title, string initialDir) {
        var dlg = (IFileDialog)new FileOpenDialog();
        uint options;
        dlg.GetOptions(out options);
        // FOS_PICKFOLDERS (0x20) | FOS_FORCEFILESYSTEM (0x40) | FOS_PATHMUSTEXIST (0x800)
        dlg.SetOptions(options | 0x20u | 0x40u | 0x800u);
        if (!string.IsNullOrEmpty(title)) {
            dlg.SetTitle(title);
        }
        dlg.SetOkButtonLabel("Klasoru Sec");
        if (!string.IsNullOrEmpty(initialDir)) {
            try {
                Guid g = typeof(IShellItem).GUID;
                IShellItem item;
                SHCreateItemFromParsingName(initialDir, IntPtr.Zero, ref g, out item);
                dlg.SetFolder(item);
            } catch {}
        }
        IntPtr hwnd = GetForegroundWindow();
        int hr = dlg.Show(hwnd);
        if (hr == 0) {
            IShellItem result;
            dlg.GetResult(out result);
            string path;
            result.GetDisplayName(0x80058000u, out path);
            return path;
        }
        return "";
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp

if ($TestCompile) {
  Write-Output "MODERN_PICKER_COMPILED_OK"
  exit 0
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dir = if ($InitialDir -and (Test-Path $InitialDir)) { $InitialDir } else { [Environment]::GetFolderPath('Desktop') }
$picked = [ModernFolderPicker]::Pick($Title, $dir)
if ($picked) {
  Write-Output $picked
}
