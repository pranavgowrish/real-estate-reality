interface ConvenienceCardProps {
    title: string;
    conven: React.ReactNode;
  }
  
  function ConvenienceCard(props: ConvenienceCardProps) {
    return (
      <div className="rounded-xl shadow-2xl p-4 border-[3.6px] border-[#006aff] font-semibold">
        <div className="flex items-center justify-between font-bold">
          <p className="text-base font-bold ">{props.title}</p>
          <span className="text-lg font-extrabold">{props.conven}</span>
        </div>
      </div>
    );
  }
  export default ConvenienceCard;