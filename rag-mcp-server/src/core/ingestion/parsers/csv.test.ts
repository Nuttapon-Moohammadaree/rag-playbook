/**
 * Tests for CSV Parser
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

import { parseCsvFile } from './csv.js';

describe('CSV Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCsvFile', () => {
    it('should parse simple CSV file', async () => {
      const csv = `name,age,city
John,30,NYC
Jane,25,LA`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('name: John');
      expect(result.content).toContain('age: 30');
      expect(result.content).toContain('city: NYC');
      expect(result.metadata.source).toBe('/path/to/file.csv');
    });

    it('should include column headers in metadata', async () => {
      const csv = `id,product,price
1,Apple,1.99
2,Banana,0.99`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.metadata.columns).toEqual(['id', 'product', 'price']);
    });

    it('should include row count in metadata', async () => {
      const csv = `a,b
1,2
3,4
5,6`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.metadata.rowCount).toBe(3);
    });

    it('should handle empty CSV', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toBe('');
    });

    it('should handle CSV with only header', async () => {
      mockReadFile.mockResolvedValue('name,age,city');

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toBe('');
      expect(result.metadata.rowCount).toBe(0);
    });
  });

  describe('Quoted Fields', () => {
    it('should handle quoted fields', async () => {
      const csv = `name,description
"John Doe","A person"`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('name: John Doe');
      expect(result.content).toContain('description: A person');
    });

    it('should handle fields with commas inside quotes', async () => {
      const csv = `name,address
John,"123 Main St, Apt 4"`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('address: 123 Main St, Apt 4');
    });

    it('should handle fields with newlines inside quotes', async () => {
      const csv = `name,notes
John,"Line 1
Line 2"`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('notes: Line 1\nLine 2');
    });

    it('should handle escaped quotes (double quotes)', async () => {
      const csv = `name,quote
John,"He said ""Hello"""`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('quote: He said "Hello"');
    });

    it('should handle empty quoted fields', async () => {
      const csv = `name,middle
John,""`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('middle:');
    });
  });

  describe('Line Endings', () => {
    it('should handle Unix line endings (LF)', async () => {
      const csv = "name,value\nJohn,1\nJane,2";
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('name: John');
      expect(result.content).toContain('name: Jane');
      expect(result.metadata.rowCount).toBe(2);
    });

    it('should handle Windows line endings (CRLF)', async () => {
      const csv = "name,value\r\nJohn,1\r\nJane,2";
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('name: John');
      expect(result.content).toContain('name: Jane');
      expect(result.metadata.rowCount).toBe(2);
    });

    it('should handle mixed line endings', async () => {
      const csv = "name,value\r\nJohn,1\nJane,2";
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.metadata.rowCount).toBe(2);
    });

    it('should handle trailing newline', async () => {
      const csv = "name,value\nJohn,1\n";
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.metadata.rowCount).toBe(1);
    });
  });

  describe('Section Extraction', () => {
    it('should create sections for each data row', async () => {
      const csv = `name,value
John,100
Jane,200`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.sections).toBeDefined();
      expect(result.sections!.length).toBe(2);
      expect(result.sections![0].title).toBe('Row 1');
      expect(result.sections![1].title).toBe('Row 2');
    });

    it('should include all columns in section content', async () => {
      const csv = `name,age,city
John,30,NYC`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      const section = result.sections![0];
      expect(section.content).toContain('name: John');
      expect(section.content).toContain('age: 30');
      expect(section.content).toContain('city: NYC');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rows with missing values', async () => {
      const csv = `a,b,c
1,,3
4,5,`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('b:');
      expect(result.content).toContain('c:');
    });

    it('should handle extra columns in rows', async () => {
      const csv = `a,b
1,2,3,4`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      // Should not crash, handles gracefully
      expect(result.content).toContain('a: 1');
      expect(result.content).toContain('b: 2');
    });

    it('should handle whitespace in fields', async () => {
      const csv = `name, value
 John , 123 `;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('name: John');
      expect(result.content).toContain('value: 123');
    });

    it('should skip empty rows', async () => {
      const csv = `name,value
John,1

Jane,2`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      // Empty row should be skipped
      expect(result.metadata.rowCount).toBe(2);
    });

    it('should handle single column CSV', async () => {
      const csv = `name
John
Jane`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('name: John');
      expect(result.content).toContain('name: Jane');
    });

    it('should handle large number of columns', async () => {
      const headers = Array.from({ length: 50 }, (_, i) => `col${i}`).join(',');
      const values = Array.from({ length: 50 }, (_, i) => `val${i}`).join(',');
      const csv = `${headers}\n${values}`;
      mockReadFile.mockResolvedValue(csv);

      const result = await parseCsvFile('/path/to/file.csv');

      expect(result.content).toContain('col0: val0');
      expect(result.content).toContain('col49: val49');
    });
  });
});
