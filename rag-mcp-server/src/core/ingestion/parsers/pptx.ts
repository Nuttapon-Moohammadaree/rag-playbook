/**
 * PPTX (PowerPoint) document parser using officeparser
 */

import officeparser from 'officeparser';
import type { OfficeParserAST, OfficeContentNode } from 'officeparser';
import type { ParsedDocument, ParsedSection } from '../../../types/index.js';

/**
 * Parse PPTX file and extract text content
 */
export async function parsePptxFile(filepath: string): Promise<ParsedDocument> {
  const result: OfficeParserAST = await officeparser.parseOffice(filepath);

  const sections: ParsedSection[] = [];
  const docTitle = result.metadata?.title;

  // Process slides from AST
  if (result.content) {
    result.content.forEach((node: OfficeContentNode, index: number) => {
      if (node.type === 'slide') {
        // Extract text from slide's paragraph children
        const texts: string[] = [];
        if (node.children) {
          for (const child of node.children) {
            if (child.text) {
              texts.push(child.text);
            }
          }
        }
        const slideText = texts.join('\n').trim();
        const slideNumber = (node.metadata as { slideNumber?: number })?.slideNumber || index + 1;

        if (slideText) {
          sections.push({
            title: `Slide ${slideNumber}`,
            content: slideText,
            slideNumber: slideNumber as number,
          });
        }
      }
    });
  }

  // Use toText() for full content
  const fullContent = result.toText();

  return {
    content: fullContent.trim(),
    metadata: {
      title: docTitle,
      source: filepath,
    },
    sections,
  };
}
