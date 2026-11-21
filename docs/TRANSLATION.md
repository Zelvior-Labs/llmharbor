# Translating

## Dashboard strings

The dashboard ships 60 locales under `client/src/i18n/locales/`. `en.json` is the source of truth,
and every other file mirrors its key structure exactly.

- Never add or remove keys in one locale on its own. A new string starts in `en.json`, and every
  locale follows.
- Run the validator from `client/`:

  ```bash
  npm run check:i18n
  ```

  It checks every locale for key parity, value types and matching `{placeholder}` names. It does
  not check translation quality, so read your diff too.
- Keep a PR to one locale where you can.
- Translate the meaning, not the words. If an English string is ambiguous, look at where it
  renders before you choose a translation.

## README and docs

The English pages live in `docs/en/`. A translation uses the same file names in `docs/<lang>/`
(currently `docs/zh-cn/`). Each page starts with a language switcher line that links to the other
language's copy of the same file. The root README is translated as `README.<lang>.md`. When you
change an English page, update the translations or note in the PR that they are now behind.

## Chinese (zh-CN) terminology

These terms were settled in review. If you want to change one, give a reason stronger than
preference: a standards body, a reference product, or a real ambiguity in the current wording.

| English | zh-CN | Notes |
| --- | --- | --- |
| Provider | 提供方 | Not 提供商. Custom endpoints, local Ollama and community-run instances are not vendors. |
| Token (LLM) | 词元 | The term published by the national sci-tech terminology committee ([termonline.cn](https://termonline.cn)). |
| Token (auth, API keys, URL tokens) | 令牌 | Never 词元. These are credentials. |
| Coding | 编程 | Not 编码, which reads as "encoding". |
| Export | 导出 | Not 出口 (the shipping sense). |
| Request size | 请求大小 | Not 请求数据量, which reads as an aggregate. |
| Request body | 请求正文 | 请求体 is common in speech and not wrong, but use 请求正文 here. |
| Revoke | 撤销 | Not 废除. |
| Playground | 试验台 | Not 试玩台, where 试玩 suggests a game demo. |
| Balance (the custom preset) | 权衡 | The numeric sliders themselves are 权重. |
| you | 您 | Not 你. Dropping the pronoun is still better where the sentence reads naturally without it. |
| English (UI language) | 英文 | Not 英语. Its sibling label is 中文. |

The strategy presets are comparative, so they keep 最: 最快, 最稳定, 最智能.

Use full-width punctuation (，。：；). Latin words and numbers inside Chinese text take a space on
each side, as in `API 令牌`.

词元 is a deliberate choice. Most Chinese AI products show `Token` in Latin script, so 词元 can look
formal. Changing it touches many strings, so open an issue first instead of folding the change into
an unrelated PR.

## zh-TW is not zh-CN

zh-TW diverges on purpose. Don't sync it to zh-CN term for term:

| English | zh-TW |
| --- | --- |
| Token | `Token`, left in Latin script |
| Provider | 提供者 |
| Playground | 遊樂場 |

When you update one of the two files, check the other for the same string, but follow the local
convention rather than making them identical.
