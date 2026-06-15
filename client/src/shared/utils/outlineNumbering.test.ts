import { describe, expect, it } from 'vitest';
import { formatOutlineNumber, formatOutlineTitle, numberToChinese } from './outlineNumbering';

describe('outline numbering', () => {
  it('formats common Chinese numbers used by outline headings', () => {
    expect(numberToChinese(1)).toBe('一');
    expect(numberToChinese(10)).toBe('十');
    expect(numberToChinese(21)).toBe('二十一');
    expect(numberToChinese(105)).toBe('一百零五');
  });

  it('uses the last outline id segment for level-local numbering', () => {
    expect(formatOutlineNumber('2', 'chinese-chapter')).toBe('第二章');
    expect(formatOutlineNumber('2.3', 'chinese-section')).toBe('第三节');
    expect(formatOutlineNumber('2.3.4', 'arabic-dun')).toBe('4、');
    expect(formatOutlineNumber('2.3.4.5', 'none')).toBe('');
  });

  it('combines prefixes and titles without inventing numbering for invalid ids', () => {
    expect(formatOutlineTitle('1.2', '实施计划', 'chinese-section')).toBe('第二节 实施计划');
    expect(formatOutlineTitle('', '实施计划', 'chinese-section')).toBe('实施计划');
  });
});
