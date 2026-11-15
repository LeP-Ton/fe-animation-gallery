#!/usr/bin/env python3
"""把本地资源转换为公开站点索引；仅发布素材数据，不携带本机路径。"""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import quote
import argparse
import hashlib
import json
import re
import shutil
from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets-root', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--human-catalog', type=Path, required=True)
    parser.add_argument('--packages', type=Path, required=True)
    parser.add_argument('--slugs', type=Path, required=True)
    parser.add_argument('--repository', default='LeP-Ton/fe-animation-gallery')
    args = parser.parse_args()
    project = Path(__file__).resolve().parent.parent
    source = json.loads(args.catalog.read_text())
    human = json.loads(args.human_catalog.read_text())
    humans = {u['relativePath']: u for u in human['units']}
    exclusions = {u['relativePath']: u for u in human['exclusions']}
    packages = json.loads(args.packages.read_text())
    if isinstance(packages, dict):
        packages = packages.get('packages', packages.get('assets', []))
    slugs = json.loads(args.slugs.read_text())
    package_by_group = {item.get('sourceGroup'): item for item in packages}
    release_base = f'https://github.com/{args.repository}/releases/download/assets-v1/'
    raw_base = 'https://github.com/Klokinator/FE-Repo/tree/main/'
    dirs = {name: project / 'assets' / name for name in ['previews', 'posters', 'credits']}
    for directory in dirs.values():
        directory.mkdir(parents=True, exist_ok=True)
    units, preview_map, variants_seen = [], {}, set()
    for index, original in enumerate(source['资源']):
        relative = original['相对目录']
        directory = args.assets_root / relative
        unit_id = hashlib.sha1(relative.encode()).hexdigest()[:16]
        prior = humans.get(relative)
        unit = {key: value for key, value in (prior or {}).items() if key not in ['variants', 'absolutePath', 'creditsUrl', 'searchText', 'reason']}
        group = original['分类']
        if prior is None:
            unit.update(id=unit_id, name=original['资源名'], primary='other', categories=['other'], appearance='其他素材',
                        reviewState='other', gender='未标注', author='', mount='', subtype='其他素材', sourceGroup=group,
                        sourceGroupLabel=group, tags=[], defaultVariant='')
        unit['id'] = unit_id
        unit['relativePath'] = relative
        unit['absolutePath'] = raw_base + quote(relative, safe='/')
        unit['sourceUrl'] = unit['absolutePath']
        unit['reason'] = prior.get('reason', '') if prior else exclusions.get(relative, {}).get('reason', '原始资源库中的其他素材。')
        unit['creditsUrl'] = f'assets/credits/{unit_id}.txt'
        credits = directory / 'CREDITS.txt'
        credit_text = credits.read_text(errors='replace') if credits.is_file() else '原目录没有独立 CREDITS.txt，请查看原始目录 README 与上游作者信息。'
        (dirs['credits'] / f'{unit_id}.txt').write_text('原始目录：' + relative + '\n来源：' + unit['sourceUrl'] + '\n\n' + credit_text)
        package = package_by_group[group]
        unit['packageUrl'] = release_base + package['fileName']
        unit['packageSize'] = package['byteSize']
        prior_variants = {v['relativePath']: v for v in prior['variants']} if prior else {}
        variants = []
        for version in original['动画版本']:
            for gif in sorted((args.assets_root / version['相对目录']).glob('*.gif')):
                gif_relative = str(gif.relative_to(args.assets_root))
                if gif_relative in variants_seen:
                    continue
                variants_seen.add(gif_relative)
                content = gif.read_bytes()
                digest = hashlib.sha256(content).hexdigest()
                gif_path = f'assets/previews/{digest}.gif'
                target = project / gif_path
                if not target.exists():
                    shutil.copy2(gif, target)
                poster_path = f'assets/posters/{digest}.png'
                if not (project / poster_path).exists():
                    cached = args.human_catalog.parent / 'posters' / (hashlib.sha1(gif_relative.encode()).hexdigest()[:16] + '.png')
                    if cached.is_file():
                        shutil.copy2(cached, project / poster_path)
                    else:
                        with Image.open(gif) as image:
                            image.convert('RGBA').save(project / poster_path)
                prior_v = prior_variants.get(gif_relative)
                variant = {key: value for key, value in (prior_v or {}).items() if key not in ['absolutePath', 'gifUrl', 'posterUrl', 'characters']}
                if prior_v is None:
                    weapon = 'other'
                    for pattern, key in [(r'gun|cannon|missile|rifle', 'firearm'), (r'handaxe', 'handaxe'), (r'bow', 'bow'), (r'dragonstone|transform|revert', 'transform'), (r'monster', 'monster'), (r'unarmed', 'unarmed'), (r'lance', 'lance'), (r'sword', 'sword'), (r'axe', 'axe'), (r'magic', 'magic'), (r'staff', 'staff')]:
                        if re.search(pattern, version['版本'], re.I):
                            weapon = key
                            break
                    variant.update(id=hashlib.sha1(gif_relative.encode()).hexdigest()[:16], version=version['版本'], filename=gif.name,
                                   label=version['版本'] + (' / ' + gif.stem if len(version['GIF文件']) > 1 else ''), weapon=weapon,
                                   kind='nonhuman' if prior is None else 'uncertain', kindLabel='其他素材' if prior is None else '附带 / 待确认',
                                   shield='unknown', shieldLabel='盾具未核查', relativePath=gif_relative)
                variant.update(gifUrl=gif_path, posterUrl=poster_path, byteSize=len(content), sha256=digest, characters=[],
                               absolutePath=raw_base.replace('/tree/main/', '/blob/main/') + quote(gif_relative, safe='/'))
                variants.append(variant)
                preview_map[gif_relative] = {'sha256': digest, 'path': gif_path}
        if not variants:
            raise ValueError('资源缺少GIF：' + relative)
        unit['variants'] = variants
        if not any(v['id'] == unit.get('defaultVariant') for v in variants):
            unit['defaultVariant'] = next((v['id'] for v in variants if v['kind'] == 'humanoid'), variants[0]['id'])
        unit['searchText'] = ' '.join([unit['name'], unit.get('author', ''), group, unit.get('sourceGroupLabel', ''), unit.get('subtype', ''), unit['appearance'], ' '.join(unit.get('tags', [])), ' '.join(v['label'] for v in variants)])
        units.append(unit)
        if index % 500 == 0:
            print(f'已准备 {index + 1}/{len(source["资源"])} 套公开素材', flush=True)
    counts = {**human['counts'], 'includedUnits': len(units), 'humanUnits': human['counts']['includedUnits'],
              'humanoidGifs': sum(len(u['variants']) for u in units), 'humanGifs': human['counts']['humanoidGifs']}
    data = {'version': 2, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'repository': args.repository,
            'upstreamUrl': 'https://github.com/Klokinator/FE-Repo', 'releaseTag': 'assets-v1', 'counts': counts,
            'categories': human['categories'] + [{'id': 'other', 'name': '其他素材', 'description': '全库中的非人形怪物、车辆、独立坐骑与器械等，保留原始分类。'}],
            'sourceGroups': sorted({u['sourceGroup'] for u in units}), 'weapons': human['weapons'], 'units': units,
            'exclusions': [{k: v for k, v in item.items() if k != 'absolutePath'} for item in human['exclusions']],
            'noPreview': [], 'packages': [{**item, 'url': release_base + item['fileName']} for item in packages]}
    # 排除清单也转为站内预览链接，不暴露本地相对父目录。
    for item in data['exclusions']:
        original_unit = next(u for u in units if u['relativePath'] == item['relativePath'])
        item['gifUrl'] = original_unit['variants'][0]['gifUrl']
    for value in [data, preview_map]:
        serialized = json.dumps(value, ensure_ascii=False)
        if '/Users/' in serialized or '/private/' in serialized or '人物.txt' in serialized:
            raise ValueError('公开索引检测到本机或私人文档信息')
    (project / 'catalog/metadata.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    (project / 'catalog/preview-map.json').write_text(json.dumps(preview_map, ensure_ascii=False, separators=(',', ':')))
    (project / 'catalog/packages.json').write_text(json.dumps(data['packages'], ensure_ascii=False, indent=2))
    print(json.dumps({'units': len(units), 'gifs': len(variants_seen), 'uniqueGifs': len({v['sha256'] for u in units for v in u['variants']})}, indent=2), flush=True)


if __name__ == '__main__':
    main()
