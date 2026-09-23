// tailwind.config.js (JavaScript)
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))"
      },
      fill: {
        hover: {
          blue: "#4299e1",
          red: "#f56565"
        }
      },
      keyframes: {
        fadeInDown: {
          "0%": {
            top: "50%",
            opacity: "0"
          },
          "100%": {
            top: "100%",
            opacity: "1"
          }
        },
        fadeInUp: {
          "0%": {
            bottom: "50%",
            opacity: "0"
          },
          "100%": {
            bottom: "100%",
            opacity: "1"
          }
        },
        changeColor: {
          "0%": {
            backgroundSize: "0 100%",
            backgroundColor: "#B9B9B9"
          },
          "100%": {
            backgroundSize: "100% 100%",
            backgroundColor: "#B4916C"
          }
        }
      }
    }
  },
  variants: {
    fill: ["hover"]
  },
  plugins: []
};
