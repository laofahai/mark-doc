"""Build the daily DOCX reference with stdlib XML/ZIP APIs, without changing formal."""
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ET.register_namespace('w', W)


def tag(name):
    return f'{{{W}}}{name}'


def child(parent, name):
    found = parent.find(tag(name))
    return found if found is not None else ET.SubElement(parent, tag(name))


def set_props(parent, name, **attrs):
    node = child(parent, name)
    node.attrib.clear()
    node.attrib.update({tag(k): str(v) for k, v in attrs.items()})


def build():
    daily = json.loads((ROOT / 'src/document-presentation.json').read_text())['daily']
    source = ROOT / 'src-tauri/resources/reference.docx'
    result = io.BytesIO()
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as dst:
        for entry in src.infolist():
            data = src.read(entry.filename)
            if entry.filename == 'word/styles.xml':
                root = ET.fromstring(data)
                if root.find(f"{tag('style')}[@{tag('styleId')}='SourceCode']") is None:
                    code = ET.SubElement(root, tag('style'), {tag('type'): 'paragraph', tag('styleId'): 'SourceCode', tag('customStyle'): '1'})
                    set_props(code, 'name', val='Source Code')
                    set_props(code, 'basedOn', val='Normal')
                    set_props(child(code, 'rPr'), 'rFonts', ascii='Consolas', hAnsi='Consolas')
                code_fonts = {
                    fonts for style in root.findall(tag('style'))
                    if style.get(tag('styleId')) in ('SourceCode', 'VerbatimChar')
                    for fonts in style.iter(tag('rFonts'))
                }
                for fonts in root.iter(tag('rFonts')):
                    if fonts in code_fonts:
                        continue
                    fonts.attrib.clear()
                    fonts.attrib.update({tag(k): v for k, v in dict(ascii='Arial', hAnsi='Arial', eastAsia='Microsoft YaHei', cs='Arial').items()})
                defaults = child(root, 'docDefaults')
                rpr = child(child(defaults, 'rPrDefault'), 'rPr')
                set_props(rpr, 'sz', val=round(daily['fontSizePx'] * 1.5))
                set_props(rpr, 'szCs', val=round(daily['fontSizePx'] * 1.5))
                for style in root.findall(tag('style')):
                    sid = style.get(tag('styleId'), '')
                    size = daily['fontSizePx']
                    heading = False
                    for i, px in enumerate(daily['headingSizesPx'], 1):
                        if sid in (f'Heading{i}', f'Heading{i}Char'):
                            size = px
                            heading = True
                    rpr = child(style, 'rPr')
                    set_props(rpr, 'sz', val=round(size * 1.5))
                    set_props(rpr, 'szCs', val=round(size * 1.5))
                    if style.get(tag('type')) == 'paragraph':
                        ppr = child(style, 'pPr')
                        before = size * daily['headingSpaceBeforeEm'] if heading else 0
                        after = size * daily['headingSpaceAfterEm'] if heading else daily['paragraphSpacingPx']
                        line_height = daily['headingLineHeight'] if heading else daily['lineHeight']
                        set_props(ppr, 'spacing', before=round(before * 15), after=round(after * 15), line=round(line_height * 240), lineRule='auto')
                        set_props(ppr, 'jc', val='left')
                        set_props(ppr, 'ind', firstLine=0, firstLineChars=0)
                        set_props(ppr, 'snapToGrid', val=0)
                data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            elif entry.filename == 'word/document.xml':
                root = ET.fromstring(data)
                for section in root.iter(tag('sectPr')):
                    for grid in section.findall(tag('docGrid')):
                        section.remove(grid)
                data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            elif entry.filename == 'word/fontTable.xml':
                root = ET.fromstring(data)
                for name, alternate in [('Arial', 'Liberation Sans'), ('Microsoft YaHei', 'PingFang SC'), ('Noto Sans CJK SC', None)]:
                    font = next((font for font in root if font.get(tag('name')) == name), None)
                    if font is None:
                        font = ET.SubElement(root, tag('font'), {tag('name'): name})
                    if alternate:
                        set_props(font, 'altName', val=alternate)
                    set_props(font, 'family', val='swiss')
                    set_props(font, 'pitch', val='variable')
                data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            dst.writestr(entry, data)
    return result.getvalue()


if __name__ == '__main__':
    (ROOT / 'src-tauri/resources/reference-daily.docx').write_bytes(build())
