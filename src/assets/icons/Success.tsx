import React from "react";

type SuccessType = {
  fill?: string;
  width?: number;
  height?: number;
};

const Success: React.FC<SuccessType> = ({ fill, width, height }) => (
  <svg width={width} height={height} fill='none' xmlns='http://www.w3.org/2000/svg'>
    <path
      fillRule='evenodd'
      clipRule='evenodd'
      d='M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm4.314-11.756a.75.75 0 1 0-1.128-.988l-3.86 4.411-2.059-1.96a.75.75 0 1 0-1.034 1.086l2.625 2.5a.75.75 0 0 0 1.081-.05l4.375-5Z'
      fill={fill}
    />
  </svg>
);

Success.defaultProps = {
  fill: "#3BD22E",
  width: 24,
  height: 24
};

export default Success;
