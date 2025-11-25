interface Props {
    value: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    onSubmit: () => Promise<void> | void;
    label: string;
    placeholder: string;
    buttonLabel: string;
    theme: 'light' | 'dark';
}
export declare function InputBox({ value, disabled, onChange, onSubmit, label, placeholder, buttonLabel, theme }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=InputBox.d.ts.map