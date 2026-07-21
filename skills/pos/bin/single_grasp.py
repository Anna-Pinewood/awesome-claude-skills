#!/usr/bin/env python3
"""
single_grasp.py — достаёт "single grasp" (шапку-суть) страницы волта.

Каскад, по убыванию приоритета:
  1. Есть секция-заголовок `single grasp` (любой уровень #..######,
     текст == "single grasp", регистр не важен) → её тело целиком,
     до следующего заголовка того же/высшего уровня. Без обрезки —
     раз написана руками, это осознанно.
  2. Иначе есть текст до первого заголовка → он, потолок 150 слов.
  3. Иначе (до заголовка пусто) → первый заголовок + 150 символов
     после него (заглушка).

Ведущий YAML-фронтматтер (--- ... ---) отбрасывается: это метаданные,
а не суть страницы.

Вызов:  uv run python single_grasp.py <путь-к-странице>
Выход:  текст шапки в stdout. Read-only: файл не меняется.
"""

import re
import sys

WORD_CAP = 150   # потолок преамбулы, слов
CHAR_CAP = 150   # длина заглушки, символов

HEADING = re.compile(r'^(#{1,6})\s+(.*)$')


def strip_frontmatter(lines):
    """Убрать ведущий YAML-фронтматтер `--- ... ---`, если он есть."""
    if lines and lines[0].strip() == '---':
        for i in range(1, len(lines)):
            if lines[i].strip() == '---':
                return lines[i + 1:]
    return lines


def find_headings(lines):
    """Все заголовки как список (индекс_строки, уровень, текст)."""
    out = []
    for i, line in enumerate(lines):
        m = HEADING.match(line)
        if m:
            out.append((i, len(m.group(1)), m.group(2).strip()))
    return out


def explicit_section(lines, headings):
    """Ветка 1: тело секции `single grasp`, если такая есть."""
    for pos, (i, level, text) in enumerate(headings):
        if text.lower() == 'single grasp':
            end = len(lines)
            for j, lvl, _ in headings[pos + 1:]:
                if lvl <= level:            # след. заголовок того же/высшего уровня
                    end = j
                    break
            return '\n'.join(lines[i + 1:end]).strip()
    return None


def preamble(lines, headings):
    """Ветка 2: текст до первого заголовка, потолок 150 слов."""
    first = headings[0][0] if headings else len(lines)
    text = '\n'.join(lines[:first]).strip()
    if not text:
        return None
    words = text.split()
    if len(words) > WORD_CAP:
        return ' '.join(words[:WORD_CAP]) + ' …'
    return text


def stub(lines, headings):
    """Ветка 3: первый заголовок + 150 символов после него."""
    if not headings:
        return ''
    i = headings[0][0]
    head_line = lines[i].strip()
    after = '\n'.join(lines[i + 1:]).strip()
    peek = after[:CHAR_CAP] + ('…' if len(after) > CHAR_CAP else '')
    return (head_line + '\n' + peek).strip()


def single_grasp(text):
    """Вернуть single grasp страницы по каскаду выше."""
    lines = strip_frontmatter(text.splitlines())
    headings = find_headings(lines)

    result = explicit_section(lines, headings)
    if result is not None:
        return result

    result = preamble(lines, headings)
    if result is not None:
        return result

    return stub(lines, headings)


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: single_grasp.py <путь-к-странице>')
    try:
        with open(sys.argv[1], encoding='utf-8') as f:
            text = f.read()
    except OSError as e:
        sys.exit(f'не читается {sys.argv[1]}: {e}')
    print(single_grasp(text))


if __name__ == '__main__':
    main()
