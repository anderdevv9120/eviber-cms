import { RichEditor } from "@/components/RichEditor";
import { useRef } from "react";

const Home = () => {
  const htmlResRef = useRef<string>("");

  return (
    <div className='bg-gray-200 py-4 rounded-md'>
      <RichEditor
        onChange={html => {
          htmlResRef.current = html;
        }}
      />
    </div>
  );
};

export default Home;
