# Генератор PNG-иконок для PWA "Юнит-Экономика PRO".
# Необязательно: SVG-иконки уже работают в современных браузерах.
# Запуск (в папке проекта):  powershell -ExecutionPolicy Bypass -File make-icons.ps1
# Создаёт icons\icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
# После генерации добавьте PNG в массив "icons" файла manifest.json.

$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "icons"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Add-Type -AssemblyName System.Drawing

function RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Make-Icon([int]$size, [string]$path, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $c1 = [System.Drawing.Color]::FromArgb(111, 147, 255)
  $c2 = [System.Drawing.Color]::FromArgb(47, 91, 224)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)

  if ($maskable) {
    $g.FillRectangle($brush, 0, 0, $size, $size)
  } else {
    $radius = $size * 0.22
    $bgPath = RoundedPath 0 0 $size $size $radius
    $g.FillPath($brush, $bgPath)
  }

  $scale = 1.0
  if ($maskable) { $scale = 0.80 }
  $off = ($size * (1 - $scale)) / 2

  $ruble = [string][char]0x20BD
  $fontSize = $size * 0.46 * $scale
  $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $textRect = New-Object System.Drawing.RectangleF($off, $off + $size * 0.01 * $scale, $size * $scale, $size * 0.62 * $scale)
  $g.DrawString($ruble, $font, $white, $textRect, $sf)

  $barW = $size * 0.11 * $scale
  $gap = $size * 0.05 * $scale
  $groupW = $barW * 3 + $gap * 2
  $startX = ($size - $groupW) / 2
  $baseY = $off + $size * 0.86 * $scale
  $heights = @($size * 0.12 * $scale, $size * 0.18 * $scale, $size * 0.25 * $scale)
  $barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
  for ($i = 0; $i -lt 3; $i++) {
    $bx = $startX + $i * ($barW + $gap)
    $bh = $heights[$i]
    $bp = RoundedPath $bx ($baseY - $bh) $barW $bh ($barW * 0.28)
    $g.FillPath($barBrush, $bp)
  }

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("Создан: {0} ({1}x{1})" -f (Split-Path $path -Leaf), $size)
}

Make-Icon 192 (Join-Path $dir "icon-192.png") $false
Make-Icon 512 (Join-Path $dir "icon-512.png") $false
Make-Icon 512 (Join-Path $dir "icon-maskable-512.png") $true
Make-Icon 180 (Join-Path $dir "apple-touch-icon.png") $false
Write-Host "Готово. Иконки в папке icons\"
