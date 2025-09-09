"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamic = exports.metadata = void 0;
exports.default = RootLayout;
require("./globals.css");
const google_1 = require("next/font/google");
const session_provider_1 = require("@/components/providers/session-provider");
const toaster_1 = require("@/components/ui/toaster");
const react_hot_toast_1 = require("react-hot-toast");
const inter = (0, google_1.Inter)({ subsets: ['latin'] });
exports.metadata = {
    title: 'ERP Suite - Sistema Tributario Peruano',
    description: 'Sistema completo para gestión tributaria con CPE, GRE y SIRE',
};
exports.dynamic = 'force-dynamic';
function RootLayout({ children, }) {
    return (<html lang="es" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <div className="app-wrapper">
          <session_provider_1.SessionProvider session={null}>
            {children}
            <toaster_1.Toaster />
            <react_hot_toast_1.Toaster />
          </session_provider_1.SessionProvider>
        </div>
      </body>
    </html>);
}
