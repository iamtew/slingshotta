set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

logo:
    New-Item -ItemType Directory -Force static/img | Out-Null
    Copy-Item assets/logo.svg static/img/logo.svg -Force

favicon: logo
    magick -background none assets/logo.svg -define icon:auto-resize=16,32,48 static/img/favicon.ico

assets: favicon
