"""Verify the committed reference and a real Pandoc export against shared presentation."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
daily = json.loads((ROOT / 'src/document-presentation.json').read_text())['daily']
reference = ROOT / 'src-tauri/resources/reference-daily.docx'
spec = importlib.util.spec_from_file_location('generator', ROOT / 'scripts/generate-daily-reference.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)
assert reference.read_bytes() == generator.build(), 'Run generate-daily-reference.py after changing the shared JSON'


def verify(path):
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if name.endswith('.xml'):
                ET.fromstring(archive.read(name))
        styles = ET.fromstring(archive.read('word/styles.xml'))
        document = ET.fromstring(archive.read('word/document.xml'))
        assert document.find(f'.//{W}docGrid') is None, 'Formal line grid must not constrain daily spacing'
    expected = {'Normal': daily['fontSizePx'], 'BodyText': daily['fontSizePx'], 'FirstParagraph': daily['fontSizePx']}
    expected.update({f'Heading{i}': px for i, px in enumerate(daily['headingSizesPx'], 1)})
    for sid, px in expected.items():
        style = styles.find(f"{W}style[@{W}styleId='{sid}']")
        assert style is not None, sid
        assert style.find(f'{W}rPr/{W}sz').get(W + 'val') == str(round(px * 1.5)), sid
        assert style.find(f'{W}rPr/{W}szCs').get(W + 'val') == str(round(px * 1.5)), sid
        spacing = style.find(f'{W}pPr/{W}spacing')
        heading = sid.startswith('Heading')
        line_height = daily['headingLineHeight'] if heading else daily['lineHeight']
        before = px * daily['headingSpaceBeforeEm'] if heading else 0
        after = px * daily['headingSpaceAfterEm'] if heading else daily['paragraphSpacingPx']
        assert spacing.get(W + 'line') == str(round(line_height * 240)), sid
        assert spacing.get(W + 'lineRule') == 'auto', sid
        assert spacing.get(W + 'before') == str(round(before * 15)), sid
        assert spacing.get(W + 'after') == str(round(after * 15)), sid
        assert style.find(f'{W}pPr/{W}jc').get(W + 'val') == 'left', sid
        assert style.find(f'{W}pPr/{W}ind').get(W + 'firstLine') == '0', sid
        assert style.find(f'{W}pPr/{W}snapToGrid').get(W + 'val') == '0', sid
    fonts = styles.find(f'{W}docDefaults/{W}rPrDefault/{W}rPr/{W}rFonts')
    assert fonts.get(W + 'ascii') == 'Arial'
    assert fonts.get(W + 'eastAsia') == 'Microsoft YaHei'
    for sid in ('SourceCode', 'VerbatimChar'):
        fonts = styles.find(f"{W}style[@{W}styleId='{sid}']/{W}rPr/{W}rFonts")
        assert fonts is not None, sid
        for script in ('ascii', 'hAnsi'):
            assert fonts.get(W + script) in ('Courier New', 'Consolas'), sid


verify(reference)
if '--reference-only' not in sys.argv:
    with tempfile.TemporaryDirectory(prefix='markdoc-daily-test-') as directory:
        output = Path(directory) / 'actual.docx'
        subprocess.run(['pandoc', '-f', 'markdown', '--reference-doc', str(reference), '-o', str(output)],
                       input='\n\n'.join('#' * i + f' Heading {i}' for i in range(1, 7)) + '\n\nDaily body.\n\nSecond paragraph with `inline code`.\n\n```\ncode block\n```\n',
                       text=True, check=True)
        verify(output)
print('Daily reference matches document-presentation.json' + ('' if '--reference-only' in sys.argv else '; actual Pandoc output verified'))
