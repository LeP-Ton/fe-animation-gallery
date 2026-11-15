#!/usr/bin/env python3
"""构建GitHub Pages目录；CI可从已发布的素材快照还原GIF，无需将大文件纳入Git。"""
from pathlib import Path
from urllib.request import urlopen
import argparse
import hashlib
import json
import shutil
import tempfile
import zipfile


def download_checked(package, archive):
    with urlopen(package['url'], timeout=120) as response, archive.open('wb') as output:
        shutil.copyfileobj(response, output, 1024 * 1024)
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != package['sha256']:
        raise ValueError('Release素材包SHA-256校验失败')


def restore_posters(root, data):
    expected = {variant['posterUrl'] for unit in data['units'] for variant in unit['variants']}
    missing = [name for name in expected if not (root / name).is_file()]
    if not missing:
        return
    package = json.loads((root / 'catalog/posters-package.json').read_text())
    print('从Release还原静态缩略图…', flush=True)
    with tempfile.TemporaryDirectory() as temporary:
        archive = Path(temporary) / 'posters.zip'
        download_checked(package, archive)
        with zipfile.ZipFile(archive) as zipped:
            if set(zipped.namelist()) != expected:
                raise ValueError('缩略图包与公开索引不一致')
            for name in missing:
                # 只写入索引声明的缩略图，拒绝越出生成目录的归档路径。
                path = Path(name)
                if path.parts[:2] != ('assets', 'posters') or '..' in path.parts or path.is_absolute():
                    raise ValueError('缩略图路径无效')
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(zipped.read(name))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--restore-previews', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    data = json.loads((root / 'catalog/metadata.json').read_text())
    previews = json.loads((root / 'catalog/preview-map.json').read_text())
    needed = {item['path']: item['sha256'] for item in previews.values()}
    if args.restore_previews:
        restore_posters(root, data)
    if args.restore_previews and any(not (root / path).is_file() for path in needed):
        package = next(p for p in data['packages'] if p['sourceGroup'] is None)
        print('从Release素材快照还原预览GIF…', flush=True)
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / 'assets.zip'
            download_checked(package, archive)
            with zipfile.ZipFile(archive) as zipped:
                for name, item in previews.items():
                    target = root / item['path']
                    if target.is_file():
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    content = zipped.read(name)
                    if hashlib.sha256(content).hexdigest() != item['sha256']:
                        raise ValueError('GIF校验失败：' + name)
                    target.write_bytes(content)
    site = root / 'site'
    site.mkdir(exist_ok=True)
    for source in (root / 'src').iterdir():
        if source.is_file():
            shutil.copy2(source, site / source.name)
    for folder in ['assets', 'vendor']:
        shutil.copytree(root / folder, site / folder, dirs_exist_ok=True)
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    (site / 'catalog-data.js').write_text('window.ANIMATION_CATALOG=' + serialized + ';\n')
    (site / 'catalog-manifest.json').write_text(json.dumps(data, ensure_ascii=False))
    for name in ['README.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE']:
        if (root / name).is_file():
            shutil.copy2(root / name, site / name)
    (site / '.nojekyll').write_text('')
    for path, digest in needed.items():
        if not (site / path).is_file():
            raise ValueError('预览缺失：' + path)
    total = sum(p.stat().st_size for p in site.rglob('*') if p.is_file())
    if total >= 1_000_000_000:
        raise ValueError('静态站点超过GitHub Pages的1GB限制')
    (root / 'catalog/build-summary.json').write_text(json.dumps({'units': len(data['units']), 'gifs': sum(len(u['variants']) for u in data['units']), 'siteBytes': total}, indent=2))
    print(f'构建完成：{len(data["units"])}套资源，静态站点{total / 1024**2:.1f} MiB', flush=True)


if __name__ == '__main__':
    main()
