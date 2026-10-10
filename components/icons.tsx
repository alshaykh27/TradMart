type IconProps = { size?: number };

/** Facebook glyph (the mark used in the original footer socials row). */
export function FacebookIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 9H15V6.5h-1.5c-1.93 0-3.5 1.57-3.5 3.5V11H8v2.5h2v4.5h2.5v-4.5h2.5L15.5 11H12.5v-1a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

/** WhatsApp glyph (the full handset-in-bubble mark). */
export function WhatsAppIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 4.5a7.5 7.5 0 0 0-6.37 11.3L5 20l4.3-1.13a7.48 7.48 0 1 0 2.74-14.37Zm0 1.5a6 6 0 1 1-3.05 11.16l-.31-.18-2.55.67.68-2.48-.2-.32A6 6 0 0 1 12.04 6Zm-2.7 3.05c-.13 0-.34.05-.52.26-.18.2-.69.67-.69 1.64 0 .97.7 1.9.8 2.03.1.13 1.36 2.18 3.36 2.97 1.66.66 2 .53 2.36.5.36-.03 1.16-.48 1.33-.93.17-.46.17-.85.12-.93-.05-.08-.18-.13-.38-.23-.2-.1-1.17-.57-1.35-.64-.18-.07-.31-.1-.44.1-.13.2-.5.63-.62.76-.11.13-.23.14-.43.05a5.4 5.4 0 0 1-2.71-2.68c-.2-.53-.2-.55.57-.73l.26-.37c.07-.14.03-.27-.02-.37-.04-.1-.57-1.38-.79-1.88-.2-.5-.41-.43-.57-.44Z" />
    </svg>
  );
}
