type DeleteIconType = {
  color?: string;
  className?: string;
  width?: number;
  height?: number;
  handleDelete(): void;
};

const DeleteIcon = ({ color, width, height, className, handleDelete }: DeleteIconType) => (
  <svg
    width={width}
    height={height}
    fill='none'
    xmlns='http://www.w3.org/2000/svg'
    className={className}
    onClick={() => handleDelete()}
  >
    <path
      fillRule='evenodd'
      clipRule='evenodd'
      d='M1 2a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2h-4.382a1 1 0 0 1-.894-.553l-.448-.894A1 1 0 0 0 10.382 0H7.618a1 1 0 0 0-.894.553l-.448.894A1 1 0 0 1 5.382 2H1Zm2.306 4a2 2 0 0 0-1.98 2.283l1.429 10A2 2 0 0 0 4.735 20h8.53a2 2 0 0 0 1.98-1.717l1.429-10A2 2 0 0 0 14.694 6H3.306Z'
      fill={color}
    />
  </svg>
);

DeleteIcon.defaultProps = {
  color: "#A3A3A3",
  className: "",
  width: 18,
  height: 20
};
export default DeleteIcon;
