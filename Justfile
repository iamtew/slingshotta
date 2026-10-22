set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# Same as html, body color in index.html. Source SVG stays black for the editor.
mark := "#d7e2ea"

default:
    @just --list

logo:
    New-Item -ItemType Directory -Force static/img | Out-Null
    Copy-Item assets/logo.svg static/img/logo.svg -Force

favicon: logo
    magick -background none assets/logo.svg -alpha extract -background "{{mark}}" -alpha shape -define icon:auto-resize=16,32,48 static/img/favicon.ico

assets: favicon
