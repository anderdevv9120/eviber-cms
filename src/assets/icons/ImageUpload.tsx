import React, { SVGProps } from "react";

const ImageUpload = (props: SVGProps<SVGSVGElement>) => (
  <svg width={40} height={40} fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
    <rect x={1} y={1} width={38} height={38} rx={7} fill='#FFF3D8' stroke='#fff' strokeWidth={2} />
    <circle cx={11.5} cy={10.5} r={3.5} fill='#FF951F' />
    <path
      d='m9.6 18.572-5.04 9.49C3.853 29.394 4.818 31 6.327 31h13.286c1.715 0 2.634-2.017 1.51-3.312l-8.247-9.49a2 2 0 0 0-3.276.374Z'
      fill='#FFAA4C'
    />
    <path
      d='m27.356 13.466 8.014 14.57C36.103 29.37 35.139 31 33.618 31H12.49c-1.732 0-2.645-2.05-1.487-3.338l13.113-14.57a2 2 0 0 1 3.24.374Z'
      fill='#FF951F'
    />
  </svg>
);

export default ImageUpload;
