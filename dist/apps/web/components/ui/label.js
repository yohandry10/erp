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
exports.Label = void 0;
const React = __importStar(require("react"));
const LabelPrimitive = __importStar(require("@radix-ui/react-label"));
const labelStyles = {
    base: {
        display: "block",
        marginBottom: "0.75rem",
        fontWeight: "700",
        color: "var(--primary-800)",
        fontSize: "0.9rem",
        lineHeight: "1.2",
        cursor: "pointer",
    },
    disabled: {
        cursor: "not-allowed",
        opacity: "0.7",
    },
};
const Label = React.forwardRef(({ className, style, ...props }, ref) => (<LabelPrimitive.Root ref={ref} className={className} style={{
        ...labelStyles.base,
        ...style,
    }} {...props}/>));
exports.Label = Label;
Label.displayName = LabelPrimitive.Root.displayName;
