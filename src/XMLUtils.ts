var convert = require('xml-js');
/*
const appDiv = document.getElementById('app');
const xmlString = `
<?xml version="1.0" encoding="UTF-8"?>
<application xmlns="http://ns.adobe.com/air/application/33.0"> 
	<id>my_id</id> 
	<versionNumber>0.1</versionNumber>
</application>
`;
// console.log(updateXML(xmlString, 'application.id', 'B'));
*/
function updateXML(xml, attribute, value) {
  var json = convert.xml2js(xml, { compact: true, spaces: 4 });
  
  var parts = attribute.split('.');
  var len = parts.length;
  var pointer = json;
  for (var i = 0; i < len; i++) {
    var key = parts[i];
    if (!pointer.hasOwnProperty(key)) return;
    pointer = pointer[key];
  }
  if (pointer) {
    pointer._text = value;
  }
  return convert.js2xml(json, { compact: true });
}
var XMLUtils = {
	updateXML:updateXML
}
// export XMLUtils;
// export const x = 1;
module.exports = XMLUtils;
// XMLUtils.updateXML("xmlString", "application.id", "NewValue");