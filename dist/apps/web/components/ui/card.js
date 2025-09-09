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
exports.CardContent = exports.CardDescription = exports.CardTitle = exports.CardFooter = exports.CardHeader = exports.Card = void 0;
const React = __importStar(require("react"));
const cardStyles = {
    card: {
        background: "linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.1) 100%)",
        backdropFilter: "blur(20px) saturate(180%)",
        borderRadius: "var(--border-radius-lg)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow: "var(--shadow-xl)",
        color: "var(--primary-800)",
    },
    header: {
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        padding: "2rem",
    },
    title: {
        fontSize: "1.5rem",
        fontWeight: "700",
        lineHeight: "1.2",
        letterSpacing: "-0.025em",
        color: "var(--primary-900)",
        margin: "0",
    },
    description: {
        fontSize: "0.95rem",
        color: "var(--primary-600)",
        fontWeight: "500",
        margin: "0",
    },
    content: {
        padding: "2rem",
        paddingTop: "0",
    },
    footer: {
        display: "flex",
        alignItems: "center",
        padding: "2rem",
        paddingTop: "0",
    },
};
const Card = React.forwardRef(({ className, style, ...props }, ref) => (<div ref={ref} className={className} style={{
        ...cardStyles.card,
        ...style,
    }} {...props}/>));
exports.Card = Card;
Card.displayName = "Card";
const CardHeader = React.forwardRef(({ className, style, ...props }, ref) => (<div ref={ref} className={className} style={{
        ...cardStyles.header,
        ...style,
    }} {...props}/>));
exports.CardHeader = CardHeader;
CardHeader.displayName = "CardHeader";
const CardTitle = React.forwardRef(({ className, style, ...props }, ref) => (<h3 ref={ref} className={className} style={{
        ...cardStyles.title,
        ...style,
    }} {...props}/>));
exports.CardTitle = CardTitle;
CardTitle.displayName = "CardTitle";
const CardDescription = React.forwardRef(({ className, style, ...props }, ref) => (<p ref={ref} className={className} style={{
        ...cardStyles.description,
        ...style,
    }} {...props}/>));
exports.CardDescription = CardDescription;
CardDescription.displayName = "CardDescription";
const CardContent = React.forwardRef(({ className, style, ...props }, ref) => (<div ref={ref} className={className} style={{
        ...cardStyles.content,
        ...style,
    }} {...props}/>));
exports.CardContent = CardContent;
CardContent.displayName = "CardContent";
const CardFooter = React.forwardRef(({ className, style, ...props }, ref) => (<div ref={ref} className={className} style={{
        ...cardStyles.footer,
        ...style,
    }} {...props}/>));
exports.CardFooter = CardFooter;
CardFooter.displayName = "CardFooter";
