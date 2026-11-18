# The upstream freellmapi.co installer installs a different product. Direct
# users of this fork's Windows shim to the correct build without executing
# downloaded scripts or silently installing the wrong architecture.
$arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
Write-Host "Download OSSLLMAPI-<version>-windows-$arch-setup.exe from:"
Write-Host 'https://github.com/zelvior/ossllmapi/releases/latest'
