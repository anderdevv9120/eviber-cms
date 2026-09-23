import { useState, useEffect } from "react";

const useScroll = (callback: () => void) => {
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    if (isFetching) {
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [isFetching]);

  useEffect(() => {
    if (!isFetching) return;
    callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching]);

  function handleScroll() {
    const { scrollHeight } = document.body;
    if (window.innerHeight + window.scrollY >= scrollHeight - 5) {
      setIsFetching(true);
    } else {
      setIsFetching(false);
      return;
    }
  }

  return [isFetching, setIsFetching];
};

export default useScroll;
