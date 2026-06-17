# Codex Development Rules

- Read `docs/产品方案.md`, `docs/技术方案.md`, and `docs/Codex接手清单.md` before coding.
- Preserve the core product rule: users can start learning without uploading any file.
- Every course, competition, or research topic is an isolated project workspace.
- Keep TypeScript strict and avoid `any`.
- Never expose model or Supabase service-role keys to client components.
- Prefer server-side data access and validate all route inputs.
- Maintain responsive behavior at 360px, 768px, 1024px, and 1440px widths.
- Add empty, loading, success, and failure states for every async feature.
- Do not replace the existing visual language without a concrete accessibility or usability reason.
- Run `npm run lint` and `npm run build` before marking a task complete.
