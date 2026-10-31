$ErrorActionPreference = 'Stop'
$key = Read-Host 'Enter your Gemini API key (hidden; used for narration only)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
  if ($key.Length -lt 20) { throw 'The API key is empty or incomplete.' }
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
  $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & node (Join-Path $PSScriptRoot 'narrate.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Narration did not finish. See the error above; your key has not been saved.' }
} finally {
  Remove-Item Env:\GEMINI_API_KEY -ErrorAction SilentlyContinue
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $key.Dispose()
}
