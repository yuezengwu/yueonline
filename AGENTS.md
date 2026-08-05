<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Content publishing

- Article frontmatter uses `title`, `date`, `summary`, and `draft`; do not add tags.
- The homepage Writing section derives from article frontmatter and shows the latest two non-draft posts; never duplicate article entries in `lib/site.ts` or `CONTENT.md`.
- For every content update, run checks, commit, and push to GitHub before manually deploying to Vercel.
- Keep Vercel Git integration disconnected; publishing is always manually triggered.
