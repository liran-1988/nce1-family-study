# Offline SAPI worker. Use node tools/build-speech-audio.js to inventory, encode and verify.
param(
    [Parameter(Mandatory=$true)][string]$Requests,
    [string]$VoiceName = 'Microsoft Zira Desktop'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synth.SelectVoice($VoiceName)
    if ($synth.Voice.Culture.Name -ne 'en-US') { throw 'Expected installed offline en-US voice.' }
    $synth.Rate = 0
    $synth.Volume = 100
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
        22050,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    $items = Get-Content -LiteralPath $Requests -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($item in $items) {
        if (Test-Path -LiteralPath $item.wav) { throw "Refusing to overwrite WAV: $($item.wav)" }
        $synth.SetOutputToWaveFile([string]$item.wav, $format)
        $synth.Speak([string]$item.text)
        $synth.SetOutputToNull()
        [Console]::WriteLine((@{ text=$item.text; wav=$item.wav } | ConvertTo-Json -Compress))
    }
} finally {
    $synth.Dispose()
}
