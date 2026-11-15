# Security and privacy

## What MyDocs does with your data

- **Documents stay on your device.** They are saved where you choose, and backups are kept in your browser's storage on this device. Nothing is uploaded.
- **No network after loading.** No analytics, telemetry, accounts, web fonts, or remote images. In production builds a content security policy (`connect-src 'self'`, `img-src 'self' data: blob:`, no frames, no plugins) makes the browser block any request to another site.
- **Opening a file never contacts the internet.** Images that point at web addresses are removed from documents and pasted content; Word files are read only on your device.
- **Links** go only to web (`http`, `https`) and email (`mailto`) addresses, and open only on Ctrl+click.
- **Word files you open are never changed.** They open as a copy.

## Reporting a vulnerability

Please report it privately: use "Report a vulnerability" under this repository's Security tab if it's there. Otherwise, open an issue saying you've found a security problem, without the details, and you'll be contacted for them. You'll get a reply within a week.
