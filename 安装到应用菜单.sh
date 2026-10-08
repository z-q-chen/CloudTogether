#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python3 - "$base" <<'PY'
from pathlib import Path
import sys,os,shutil
base=Path(sys.argv[1]);target=Path(os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')))
icon=base/'cloudtogether.png'
if not icon.exists(): icon=base/'assets/icon.png'
if not (base/'启动云伴.sh').exists():raise SystemExit('请在发行包目录运行此脚本。')
apps=target/'applications';apps.mkdir(parents=True,exist_ok=True)
for size in [16,32,48,64,128,256,512]:
 source=base/f'icons/cloudtogether-{size}.png'
 if not source.exists(): source=base/f'assets/icons/cloudtogether-{size}.png'
 if not source.exists(): continue
 dest=target/f'icons/hicolor/{size}x{size}/apps/cloudtogether.png';dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
def quoted(s):return '"'+str(s).replace('\\','\\\\').replace('"','\\"').replace('`','\\`').replace('$','\\$')+'"'
launcher=base/'启动云伴.sh';launcher.chmod(0o755)
(apps/'cloudtogether.desktop').write_text('[Desktop Entry]\nType=Application\nName=云伴\nName[en]=CloudTogether\nComment=音乐，有人作伴。\nExec='+quoted(launcher)+'\nIcon=cloudtogether\nStartupWMClass=云伴\nCategories=AudioVideo;Audio;Music;Player;\nTerminal=false\n')
print('已添加云伴图标与应用菜单入口。请保留发行包所在目录。')
PY
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications" >/dev/null 2>&1 || true; fi
