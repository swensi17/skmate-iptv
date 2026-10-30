/** A question before something is lost. Focus starts on Cancel, so a stray OK never deletes. */
export declare function Confirm(props: {
    title: string;
    body: string;
    confirm: string;
    onConfirm: () => void;
    onCancel: () => void;
}): import("preact").JSX.Element;
