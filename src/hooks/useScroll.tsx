import { useState, useEffect, useCallback } from "react";

const useScroll = (callback: () => void) => {
  const [isFetching, setIsFetching] = useState(false);

  const handleScroll = useCallback(() => {
    const { scrollHeight } = document.body;
    setIsFetching(window.innerHeight + window.scrollY >= scrollHeight - 5);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    if (isFetching) {
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [isFetching, handleScroll]);

  useEffect(() => {
    if (!isFetching) return;
    callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching]);

  return [isFetching, setIsFetching];
};

export default useScroll;
