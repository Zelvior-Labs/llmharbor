# The upstream llmharbor.co installer installs a different product. Direct
# users of this fork's Windows shim to the correct build without executing
# downloaded scripts or silently installing the wrong architecture.
# Stock Win7 PowerShell may run on a CLR without Is64BitOperatingSystem.
$arch = if ($env:PROCESSOR_ARCHITEW6432 -or $env:PROCESSOR_ARCHITECTURE -match '64$') { 'x64' } else { 'x86' }
$os = [Environment]::OSVersion.Version
if ($os.Major -eq 6 -and $os.Minor -eq 1) {
    Write-Host "For Windows 7 SP1, download the portable ZIP ending in -windows7-$arch.zip:"
    Write-Host 'https://github.com/zelvior/llmharbor/releases?q=win7'
    Write-Host 'Extract All, then run LLMHarbor.exe inside the extracted folder. Do not use the normal setup.exe.'
    return
}
Write-Host "Download LLMHarbor-<version>-windows-$arch-setup.exe from:"
Write-Host 'https://github.com/zelvior/llmharbor/releases/latest'
