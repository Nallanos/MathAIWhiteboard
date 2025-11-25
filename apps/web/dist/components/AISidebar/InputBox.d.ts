interface Props {
    value: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    onSubmit: () => Promise<void> | void;
}
export declare function InputBox({ value, disabled, onChange, onSubmit }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=InputBox.d.ts.map