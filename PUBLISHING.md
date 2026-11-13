# Publishing `dsh-chat-find`

Everything local is done. The remaining steps need your GitHub and npm accounts.

## 1. Create the public repository

- Repo name: **`dsh-chat-find`** (must match `package.json` `name`).
- Push the contents of this directory (not the workspace root).
- Add the GitHub topic **`dsh-plugin`**.
- The repository must be **at least 1 day old** before the catalog PR passes CI.
- Fill in `repository` in `package.json` once the URL exists:

  ```json
  "repository": { "type": "git", "url": "git+https://github.com/<owner>/dsh-chat-find.git" }
  ```

## 2. Screenshots (recommended before the PR)

Done: `assets/screenshot-light.png` and `assets/screenshot-dark.png` are real
app shots and are declared in `screenshots.json`.

## 3. Publish to npm (optional)

There is no npm account for this project, and the catalog does not require one:
GitHub-only entries install from `git+https://github.com/LLinsanity/dsh-chat-find`
and work the same way. Publishing later only adds a download figure and lets
users install by the short package name.

If an account is created later:

```sh
npm login --auth-type=web
npm publish --access public
```

The published package's `repository` field must point at this repository or the
catalog will not link the two. `private` is already removed.

## 4. Submit to the catalog

Open a PR against <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
adding **one file**: `data/plugins/<owner>__<repo>.yml`.

A ready-to-edit copy is in [`submission/dsh-chat-find.yml`](submission/dsh-chat-find.yml).

Rules that get submissions bounced:

- Description must be accurate — the reviewer reads the code and checks every
  claim (numbers, APIs, behaviours). Our entry claims CSS Highlight API,
  message-only scope, and on-demand earlier history; all three are real.
- At most 3 entries per PR.
- Do not edit the generated READMEs.
- Category is `ui` (UI Enhancements).
- Icon must be a GitHub-hosted raster image (PNG/JPG/WebP); SVG is refused. We
  ship `assets/icon-180.png` for this.

Merging rebuilds the site and the market index automatically (usually within a
day), and `dsh-market` / Discover pick it up with no further action.

## 5. Naming and search discoverability

The market weights the package name and localized titles three times, and
keywords twice. Current metadata:

- name: `dsh-chat-find`
- title (en/zh): `Find in conversation` / `对话内查找`
- keywords: `dsh-plugin, find, search, chat, conversation, ctrl+f, highlight, 查找, 搜索, 对话`

Keep the word `find` in the name; do not rename to something poetic. Search is
prefix + fuzzy, so `chat find`, `查找`, `搜索对话` all reach it.
