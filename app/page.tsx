import { DemoFront } from "@/components/DemoFront";
import { HomeClient } from "@/components/HomeClient";
import { TechnicalWriteup } from "@/components/TechnicalWriteup";

export default function Home() {
  return (
    <HomeClient
      front={
        <>
          <DemoFront />
          <TechnicalWriteup />
        </>
      }
    />
  );
}
