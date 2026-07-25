const path = require('path')

module.exports = {
  plugins: {
    // Resolver el config de Tailwind por ruta absoluta (vía __dirname) para que
    // el build funcione sin importar el CWD desde el que se arranque Next.
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.js') },
    autoprefixer: {},
  },
}
