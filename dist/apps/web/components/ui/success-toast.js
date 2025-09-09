'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showSuccessToast = void 0;
const react_1 = __importDefault(require("react"));
const react_hot_toast_1 = require("react-hot-toast");
const canvas_confetti_1 = __importDefault(require("canvas-confetti"));
const showSuccessToast = ({ title, message, icon = '✅', duration = 4000 }) => {
    // Confetti explosion
    const triggerConfetti = () => {
        // Onda 1: Confetti dorado desde la izquierda
        (0, canvas_confetti_1.default)({
            particleCount: 100,
            spread: 70,
            origin: { x: 0.1, y: 0.6 },
            colors: ['#FFD700', '#FFA500', '#FF6347'],
            shapes: ['circle', 'square'],
            scalar: 1.2
        });
        // Onda 2: Confetti plateado desde la derecha
        setTimeout(() => {
            (0, canvas_confetti_1.default)({
                particleCount: 100,
                spread: 70,
                origin: { x: 0.9, y: 0.6 },
                colors: ['#C0C0C0', '#87CEEB', '#98FB98'],
                shapes: ['circle', 'square'],
                scalar: 1.2
            });
        }, 200);
        // Onda 3: Estrellas desde arriba
        setTimeout(() => {
            (0, canvas_confetti_1.default)({
                particleCount: 50,
                spread: 100,
                origin: { x: 0.5, y: 0.1 },
                colors: ['#FFD700', '#FF69B4', '#00CED1'],
                shapes: ['star'],
                scalar: 1.5
            });
        }, 400);
    };
    triggerConfetti();
    return react_hot_toast_1.toast.custom((t) => (<div className={`${t.visible ? 'animate-enter' : 'animate-exit'} max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-lg">{icon}</span>
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {title}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {message}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button onClick={() => react_hot_toast_1.toast.dismiss(t.id)} className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-green-600 hover:text-green-500 focus:outline-none focus:ring-2 focus:ring-green-500">
          ✕
        </button>
      </div>
    </div>), { duration });
};
exports.showSuccessToast = showSuccessToast;
exports.default = exports.showSuccessToast;
