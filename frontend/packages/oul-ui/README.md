# OUL UI

`oul-ui` is the in-repo design system consumed by OUL Studio's React/PWA
frontend. It is a real workspace package (`name: "oul-ui"`) consumed by the app through
`file:./packages/oul-ui`. There is no published package named `oul-ui` in the
npm registry (checked at delivery time, 404), so this package supplies that
contract locally.

## Components

- Button / IconButton
- TextField / TextAreaField / SelectField
- Chip / Switch / Segmented
- Sheet (focusable, scroll-locking bottom sheet)
- Spinner / Skeleton / EmptyState / Avatar / Badge / InlineNotice / SectionHeader
- Global OUL UI CSS with design tokens

Import from the package:

```tsx
import { Button, Sheet, TextField } from 'oul-ui'
import 'oul-ui/oul.css'
```

The visual language (warm paper, ink, acid lime, Instrument Serif + Manrope)
is intentionally coupled to the OUL Studio brand. It can be consumed by other
OUL surfaces through the same package.
