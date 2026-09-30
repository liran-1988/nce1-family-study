"""Task-local emulator: no system changes or host user-content upload."""
from pathlib import Path
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / '.private'
SDK = PRIVATE / 'emulator-sdk'
AVD = PRIVATE / 'avd'
AVD.mkdir(exist_ok=True)
DEVICE = AVD / 'NceTest.avd'
DEVICE.mkdir(exist_ok=True)
if not (SDK / 'platform-tools').exists():
    shutil.copytree(Path(os.environ.get('ANDROID_SDK_ROOT', str(Path.home() / 'AppData/Local/Android/Sdk'))) / 'platform-tools', SDK / 'platform-tools')
(AVD / 'NceTest.ini').write_text('avd.ini.encoding=UTF-8\npath=' + str(DEVICE) + '\ntarget=android-34\n', encoding='utf-8')
config = {
    'avd.ini.encoding': 'UTF-8', 'AvdId': 'NceTest', 'abi.type': 'x86_64',
    'hw.cpu.arch': 'x86_64', 'hw.cpu.ncore': '4', 'hw.ramSize': '2048',
    'hw.lcd.width': '1080', 'hw.lcd.height': '1920', 'hw.lcd.density': '420',
    'hw.gpu.enabled': 'yes', 'hw.gpu.mode': 'swiftshader_indirect',
    'hw.keyboard': 'yes', 'hw.mainKeys': 'no', 'hw.audioInput': 'no',
    'disk.dataPartition.size': '4G', 'image.sysdir.1': str(SDK / 'system-images/android-34/default/x86_64') + '/',
    'tag.id': 'default', 'tag.display': 'Default', 'showDeviceFrame': 'no',
    'fastboot.forceColdBoot': 'yes', 'PlayStore.enabled': 'false'
}
(DEVICE / 'config.ini').write_text(''.join(f'{key}={value}\n' for key, value in config.items()), encoding='utf-8')
env = os.environ.copy()
env.update(ANDROID_AVD_HOME=str(AVD), ANDROID_HOME=str(SDK), ANDROID_SDK_ROOT=str(SDK))
args = [str(SDK / 'emulator/emulator.exe'), '-avd', 'NceTest', '-no-snapshot', '-no-boot-anim',
        '-gpu', 'swiftshader_indirect', '-no-metrics', '-port', '5556', '-no-window', '-netdelay', 'none']
subprocess.run(args, env=env, cwd=ROOT, check=True)
