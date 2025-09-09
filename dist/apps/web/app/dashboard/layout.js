'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DashboardLayout;
const sidebar_1 = __importDefault(require("../../components/layout/sidebar"));
function DashboardLayout({ children, }) {
    return (<div style={{ display: 'flex', minHeight: '100vh' }}>
      <sidebar_1.default />
      <main style={{
            flex: 1,
            marginLeft: '280px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
            minHeight: '100vh'
        }}>
        {children}
      </main>
      
      <style jsx>{`
        @media (max-width: 768px) {
          main {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>);
}
