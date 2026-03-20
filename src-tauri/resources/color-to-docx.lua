-- Pandoc Lua filter for docx export:
-- Convert <span style="color:#RRGGBB">text</span> to native docx colored text

function Span(elem)
  local style = elem.attr.attributes["style"]
  if style then
    local color = style:match("color:%s*#([%x]+)")
    if not color then
      local named = style:match("color:%s*(%a+)")
      if named then
        local color_map = {
          red = "FF0000", blue = "0000FF", green = "008000",
          orange = "FF8C00", purple = "800080", brown = "8B4513",
          cyan = "00CED1", magenta = "FF00FF", yellow = "FFD700",
          black = "000000", white = "FFFFFF", gray = "808080", grey = "808080",
          darkred = "8B0000", darkblue = "00008B", darkgreen = "006400",
          crimson = "DC143C", royalblue = "4169E1", tomato = "FF6347",
          deeppink = "FF1493", blueviolet = "8A2BE2", darkviolet = "9400D3",
        }
        color = color_map[named:lower()]
      end
    end
    if color then
      if #color == 3 then
        color = color:sub(1,1):rep(2) .. color:sub(2,2):rep(2) .. color:sub(3,3):rep(2)
      end
      local text = pandoc.utils.stringify(elem)
      text = text:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;")
      local xml = string.format(
        '<w:r><w:rPr><w:color w:val="%s"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r>',
        color:upper(), text
      )
      return pandoc.RawInline("openxml", xml)
    end
  end
  return nil
end
