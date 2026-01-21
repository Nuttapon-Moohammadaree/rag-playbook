/**
 * Tests for XLSX Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Mock xlsx
const mockRead = vi.fn();
const mockSheetToTxt = vi.fn();
vi.mock('xlsx', () => ({
  read: (...args: unknown[]) => mockRead(...args),
  utils: {
    sheet_to_txt: (...args: unknown[]) => mockSheetToTxt(...args),
  },
}));

import { parseXlsxFile } from './xlsx.js';

describe('XLSX Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(Buffer.from('mock xlsx buffer'));
  });

  describe('parseXlsxFile', () => {
    it('should parse XLSX file with single sheet', async () => {
      const mockSheet = { A1: { v: 'Data' } };
      mockRead.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: mockSheet },
      });
      mockSheetToTxt.mockReturnValue('Column A\tColumn B\nValue1\tValue2');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(mockReadFile).toHaveBeenCalledWith('/path/to/file.xlsx');
      expect(mockRead).toHaveBeenCalled();
      expect(result.content).toContain('[Sheet: Sheet1]');
      expect(result.content).toContain('Column A');
      expect(result.metadata.source).toBe('/path/to/file.xlsx');
    });

    it('should parse XLSX file with multiple sheets', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Data', 'Summary', 'Appendix'],
        Sheets: {
          Data: {},
          Summary: {},
          Appendix: {},
        },
      });
      mockSheetToTxt
        .mockReturnValueOnce('Data sheet content')
        .mockReturnValueOnce('Summary sheet content')
        .mockReturnValueOnce('Appendix sheet content');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.content).toContain('[Sheet: Data]');
      expect(result.content).toContain('[Sheet: Summary]');
      expect(result.content).toContain('[Sheet: Appendix]');
      expect(result.content).toContain('Data sheet content');
      expect(result.content).toContain('Summary sheet content');
      expect(result.content).toContain('Appendix sheet content');
    });

    it('should create sections for each sheet', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {},
          Sheet2: {},
        },
      });
      mockSheetToTxt
        .mockReturnValueOnce('Sheet 1 data')
        .mockReturnValueOnce('Sheet 2 data');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBe(2);
      expect(result.sections![0].title).toBe('Sheet1');
      expect(result.sections![0].content).toBe('Sheet 1 data');
      expect(result.sections![1].title).toBe('Sheet2');
      expect(result.sections![1].content).toBe('Sheet 2 data');
    });

    it('should skip empty sheets', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Data', 'Empty', 'More Data'],
        Sheets: {
          Data: {},
          Empty: {},
          'More Data': {},
        },
      });
      mockSheetToTxt
        .mockReturnValueOnce('Has content')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('Also has content');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      // Empty sheet should be skipped
      expect(result.sections!.length).toBe(2);
      expect(result.sections!.some(s => s.title === 'Empty')).toBe(false);
    });

    it('should skip sheets with only whitespace', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Data', 'Whitespace'],
        Sheets: {
          Data: {},
          Whitespace: {},
        },
      });
      mockSheetToTxt
        .mockReturnValueOnce('Actual content')
        .mockReturnValueOnce('   \n\t  ');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.sections!.length).toBe(1);
      expect(result.sections![0].title).toBe('Data');
    });
  });

  describe('Content Formatting', () => {
    it('should trim sheet content', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      mockSheetToTxt.mockReturnValue('  Content with padding  ');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.sections![0].content).toBe('Content with padding');
    });

    it('should separate sheets with newlines in full content', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['A', 'B'],
        Sheets: { A: {}, B: {} },
      });
      mockSheetToTxt
        .mockReturnValueOnce('Content A')
        .mockReturnValueOnce('Content B');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.content).toContain('[Sheet: A]');
      expect(result.content).toContain('[Sheet: B]');
    });

    it('should trim final content', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      mockSheetToTxt.mockReturnValue('Content');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.content).toBe(result.content.trim());
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty workbook', async () => {
      mockRead.mockReturnValue({
        SheetNames: [],
        Sheets: {},
      });

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.content).toBe('');
      expect(result.sections).toEqual([]);
    });

    it('should handle workbook with all empty sheets', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Empty1', 'Empty2'],
        Sheets: { Empty1: {}, Empty2: {} },
      });
      mockSheetToTxt.mockReturnValue('');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.content).toBe('');
      expect(result.sections).toEqual([]);
    });

    it('should propagate xlsx read errors', async () => {
      mockRead.mockImplementation(() => {
        throw new Error('Invalid XLSX file');
      });

      await expect(parseXlsxFile('/path/to/file.xlsx')).rejects.toThrow(
        'Invalid XLSX file'
      );
    });

    it('should propagate file read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(parseXlsxFile('/path/to/missing.xlsx')).rejects.toThrow(
        'File not found'
      );
    });

    it('should handle sheet names with special characters', async () => {
      mockRead.mockReturnValue({
        SheetNames: ['Sheet (1)', 'Data & Info'],
        Sheets: { 'Sheet (1)': {}, 'Data & Info': {} },
      });
      mockSheetToTxt
        .mockReturnValueOnce('Content 1')
        .mockReturnValueOnce('Content 2');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.content).toContain('[Sheet: Sheet (1)]');
      expect(result.content).toContain('[Sheet: Data & Info]');
    });

    it('should handle large number of sheets', async () => {
      const sheetNames = Array.from({ length: 50 }, (_, i) => `Sheet${i + 1}`);
      const sheets = Object.fromEntries(sheetNames.map(name => [name, {}]));
      mockRead.mockReturnValue({
        SheetNames: sheetNames,
        Sheets: sheets,
      });
      mockSheetToTxt.mockReturnValue('Content');

      const result = await parseXlsxFile('/path/to/file.xlsx');

      expect(result.sections!.length).toBe(50);
    });
  });
});
