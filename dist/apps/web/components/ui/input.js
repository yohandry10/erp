"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Input = void 0;
const React = __importStar(require("react"));
const inputStyles = {
    base: {
        width: "100%",
        padding: "1rem 1.25rem",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        borderRadius: "var(--border-radius)",
        fontSize: "0.95rem",
        transition: "all 0.3s ease",
        background: "linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.1) 100%)",
        backdropFilter: "blur(10px)",
        color: "var(--primary-900)",
        outline: "none",
    },
    focus: {
        borderColor: "var(--blue-500)",
        boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.2)",
        background: "rgba(255, 255, 255, 0.3)",
    },
    disabled: {
        cursor: "not-allowed",
        opacity: "0.5",
    },
};
const Input = React.forwardRef(({ className, type, style, onFocus, onBlur, disabled, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const handleFocus = (e) => {
        setIsFocused(true);
        onFocus?.(e);
    };
    const handleBlur = (e) => {
        setIsFocused(false);
        onBlur?.(e);
    };
    const inputStyle = {
        ...inputStyles.base,
        ...(isFocused && inputStyles.focus),
        ...(disabled && inputStyles.disabled),
        ...style,
    };
    return (<input type={type} className={className} style={inputStyle} disabled={disabled} ref={ref} onFocus={handleFocus} onBlur={handleBlur} {...props}/>);
});
exports.Input = Input;
Input.displayName = "Input";
