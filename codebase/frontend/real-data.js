// Sinh tu dong boi 07_export_frontend_data.py — KHONG sua tay, chay lai pipeline neu can cap nhat.
window.REAL_REVIEW_PACK = {
  "schema_version": "1.0",
  "pack_id": "pack-day1-foundation-001",
  "status": "needs_review",
  "lesson": {
    "id": "day1-foundation",
    "title": "AI & LLM Foundation (Day 1)",
    "slide_count": 29
  },
  "analysis": {
    "student_question_count": 38,
    "unique_user_count": 7,
    "cluster_count": 10,
    "included_cluster_count": 9,
    "excluded_noise_count": 24
  },
  "summary": [
    {
      "id": "summary-01",
      "title": "Các tầng AI: AI, ML, DL, GenAI, LLM",
      "content": "AI là chiếc ô lớn nhất, bao gồm ML (học từ dữ liệu), DL (mạng nơ-ron nhiều tầng), GenAI (sinh nội dung mới) và LLM (model nền chuyên ngôn ngữ). LLM không phải toàn bộ AI nhưng là tầng nền của hầu hết trải nghiệm AI hiện nay.",
      "source_pages": [
        3
      ],
      "source_excerpt": "AI — chiếc ô lớn nhất: mọi hệ thống có yếu tố “thông minh”. Machine learning — học từ dữ liệu thay vì viết luật tay. Deep learning — mạng nơ-ron nhiều tầng tự học đặc trưng. Generative AI — sinh nội dung mới: văn bản, ảnh, code. LLM — model nền chuyên ngôn ngữ, tim của làn sóng hiện nay.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "summary-02",
      "title": "LLM là bộ não nền, chatbot là lớp áo bên ngoài",
      "content": "LLM (Large Language Model) là mô hình ngôn ngữ lớn dựa trên Transformer, được luyện để đoán token tiếp theo. Chatbot chỉ là một dạng sản phẩm đóng gói quanh LLM. LLM là bộ não dùng chung cho nhiều việc: tóm tắt, viết code, dịch thuật, phân tích.",
      "source_pages": [
        10
      ],
      "source_excerpt": "LLM (Large Language Model) là một mô hình ngôn ngữ rất lớn, thường dựa trên kiến trúc Transformer, được luyện trên hàng nghìn tỷ mảnh chữ để học cách đoán mảnh chữ tiếp theo trong ngữ cảnh. Chatbot chỉ là một dạng sản phẩm đóng gói quanh bộ não đó — lớp áo bên ngoài.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "summary-03",
      "title": "Vì sao model có thể trả lời sai (hallucination, knowledge cutoff, context hạn chế)",
      "content": "Model bị đóng băng tại ngày ngừng đọc (knowledge cutoff), không biết chuyện sau đó. Model tối ưu cho câu nghe hợp lý, không phải tra sự thật, nên có thể tự tin mà sai (hallucination). Context có trần, quá dài dễ bỏ sót thông tin ở giữa. Đây là bản chất của cỗ máy đoán token, cần prompt tốt, context sạch, RAG, tools và luôn kiểm chứng.",
      "source_pages": [
        20
      ],
      "source_excerpt": "Model bị \"đóng băng\" tại ngày ngừng đọc. Chuyện sau đó nó không biết — trừ khi bạn cung cấp thêm (knowledge cutoff). Model tối ưu cho câu nghe hợp lý, không phải tra sự thật — nên có thể tự tin mà sai (hallucination). Context có trần; quá dài vừa tốn tiền vừa dễ bỏ sót thông tin ở giữa.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "summary-04",
      "title": "Lịch sử AI 70 năm: từ expert system đến ChatGPT",
      "content": "1980: Hệ chuyên gia (expert system) tập trung giải tốt một miền hẹp bằng luật. 2009: Fei-Fei Li và ImageNet — bộ dữ liệu 14 triệu ảnh gán nhãn tay, dẫn đến AlexNet 2012. 2017: Transformer cho phép mỗi từ nhìn sang các từ quan trọng khác trong câu. 2022: ChatGPT đưa LLM đến đại chúng.",
      "source_pages": [
        6,
        7,
        8,
        9
      ],
      "source_excerpt": "1980: Hệ chuyên gia (expert system) — AI đổi chiến lược: thôi theo đuổi trí tuệ tổng quát và tập trung giải thật tốt một miền hẹp. 2009: Fei-Fei Li và ImageNet — 14 triệu ảnh được gán nhãn tay. 2017: Transformer — mỗi từ có thể nhìn sang những từ quan trọng khác trong cả câu. 2022: ChatGPT — lần đầu tiên rất đông người dùng phổ thông có thể trực tiếp chạm vào một mô hình ngôn ngữ mạnh.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "summary-05",
      "title": "Token, context và attention: cơ chế vận hành của LLM",
      "content": "Model cắt văn bản thành token (mảnh chữ). Context là lượng chữ model có thể nhìn, như bàn làm việc có hạn. Attention cho phép mỗi token chủ động nhìn lại các token trước và chấm điểm mức độ liên quan. Đặt điều quan trọng ở đầu/cuối prompt, giữ context sạch, dùng RAG để quản lý sự chú ý.",
      "source_pages": [
        13,
        14,
        15,
        16
      ],
      "source_excerpt": "Model không nhìn từ nguyên vẹn. Nó cắt văn bản thành các mảnh nhỏ gọi là token. Mỗi lần trả lời, model chỉ nhìn được một lượng chữ có hạn — gọi là context. Attention cho phép mỗi token chủ động “quay đầu” nhìn lại các token trước đó trong câu. Đầu và cuối prompt được chú ý nhiều nhất; đồ ở giữa dễ bị bỏ sót.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "summary-06",
      "title": "Temperature và top_p: hai núm vặn chọn từ",
      "content": "Temperature điều chỉnh độ 'liều' khi chọn từ: T=0 luôn chọn từ chắc nhất (ổn định), T=1 cân bằng, T=2 dễ lạc đề. Top_p chỉ giữ nhóm token có xác suất cộng dồn đạt ngưỡng p (ví dụ 0.9) và loại bỏ phần đuôi xác suất thấp. Hai núm này không làm model thông minh hơn, chỉ đổi cách chọn từ. Mặc định an toàn: temperature=0 cho việc cần ổn định.",
      "source_pages": [
        29
      ],
      "source_excerpt": "temperature — “núm vặn độ liều” — T=0 luôn chọn từ chắc nhất, T=1 cân bằng tự nhiên, T=2 phân bố phẳng ra → đa dạng, dễ lạc đề. top_p — “chỉ xem top đầu bảng” (p = 0.9) — giữ nhóm cộng dồn ≥ 90%, cắt & chuẩn hóa lại. Lưu ý quan trọng: hai núm này không làm model thông minh hơn — chỉ đổi cách chọn từ, không thêm tri thức.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "summary-07",
      "title": "Từ LLM đến agent: bốn mức độ và giải phẫu agent",
      "content": "Agent có 4 mức: Level 0 (LLM trần), Level 1 (có kết nối tool), Level 2 (biết lập kế hoạch), Level 3 (đội agent phối hợp). Agent gồm 5 bộ phận: Goal, Reasoning, Tools, Memory, Action — chạy thành vòng lặp cho tới khi xong việc. Agent không phải model khác, mà là LLM được đặt vào vòng làm việc có mục tiêu và hành động.",
      "source_pages": [
        23,
        24
      ],
      "source_excerpt": "Agent không phải “một loại model khác” — đó là LLM được đặt vào vòng làm việc có mục tiêu và hành động. Agent = Goal + Reasoning + Tools + Memory + Action — chạy thành vòng lặp cho tới khi xong việc.",
      "confidence": 1.0,
      "status": "ready"
    }
  ],
  "class_insights": [
    {
      "id": "insight-cluster-01",
      "topic": "Giải thích nội dung slide",
      "common_confusion": "Học viên yêu cầu giải thích các đoạn bôi đen hoặc nội dung slide cụ thể, cho thấy họ chưa hiểu rõ thông tin được trình bày trực quan.",
      "correct_understanding": "Các slide đã trình bày rõ ràng các khái niệm và sơ đồ. Học viên cần đọc kỹ chú thích và hình ảnh minh họa đi kèm.",
      "source_pages": [
        2,
        4,
        5
      ],
      "source_excerpt": "AI IN ACTION - Day 1 Agenda • Bức tranh AI & các tầng của AI • Lịch sử AI 70 năm • Bên trong LLM: cơ chế vận hành • Từ LLM đến AI Agent • Landscape: model hôm nay & cuộc đua hiện tại • Chọn model & chi phí token • Gọi API lần đầu • Tổng kết — những ý để mang về",
      "confidence": 0.9,
      "status": "ready",
      "unique_user_count": 4,
      "question_count": 4,
      "representative_questions": [
        "Giải thích đoạn bôi đen ở Trang 5.",
        "Giải thích đoạn bôi đen ở Trang 4.",
        "Slide này đang nói về nội dung gì?",
        "chỗ tôi vừa khoanh đấy là gì"
      ]
    },
    {
      "id": "insight-cluster-02",
      "topic": "Tổng quan Day 1",
      "common_confusion": "Học viên muốn tóm tắt nội dung chính của Day 1, cho thấy họ cần một cái nhìn tổng quan để định hướng.",
      "correct_understanding": "Day 1 giới thiệu bức tranh AI, lịch sử 70 năm, cơ chế LLM, agent, landscape model, chi phí token, và cách gọi API.",
      "source_pages": [
        2
      ],
      "source_excerpt": "AI IN ACTION - Day 1 Agenda • Bức tranh AI & các tầng của AI • Lịch sử AI 70 năm • Bên trong LLM: cơ chế vận hành • Từ LLM đến AI Agent • Landscape: model hôm nay & cuộc đua hiện tại • Chọn model & chi phí token • Gọi API lần đầu • Tổng kết — những ý để mang về",
      "confidence": 1.0,
      "status": "ready",
      "unique_user_count": 1,
      "question_count": 2,
      "representative_questions": [
        "Day 1 giới thiệu những chủ đề chính nào? Hãy trả lời ngắn gọn và trích dẫn trang.",
        "Tóm tắt ngắn gọn nội dung chính của Day 1 và trích dẫn trang slide."
      ]
    },
    {
      "id": "insight-cluster-03",
      "topic": "Giải thích khái niệm LLM",
      "common_confusion": "Học viên yêu cầu giải thích LLM, có thể chưa phân biệt được LLM với chatbot.",
      "correct_understanding": "LLM là mô hình ngôn ngữ lớn, bộ não nền; chatbot là sản phẩm đóng gói bên ngoài.",
      "source_pages": [
        10
      ],
      "source_excerpt": "LLM (Large Language Model) là một mô hình ngôn ngữ rất lớn, thường dựa trên kiến trúc Transformer, được luyện trên hàng nghìn tỷ mảnh chữ để học cách đoán mảnh chữ tiếp theo trong ngữ cảnh. Chatbot chỉ là một dạng sản phẩm đóng gói quanh bộ não đó — lớp áo bên ngoài.",
      "confidence": 1.0,
      "status": "ready",
      "unique_user_count": 1,
      "question_count": 1,
      "representative_questions": [
        "Hãy giải thích ngắn gọn LLM là gì và trích dẫn slide."
      ]
    },
    {
      "id": "insight-cluster-04",
      "topic": "Giải thích các tầng AI",
      "common_confusion": "Học viên muốn hiểu sự giống và khác nhau giữa các tầng AI (AI, ML, DL, GenAI, LLM).",
      "correct_understanding": "Các tầng từ rộng đến hẹp: AI > ML > DL > GenAI > LLM. Mỗi tầng là một tập con của tầng trước, với đặc điểm riêng.",
      "source_pages": [
        3
      ],
      "source_excerpt": "AI — chiếc ô lớn nhất: mọi hệ thống có yếu tố “thông minh”. Machine learning — học từ dữ liệu thay vì viết luật tay. Deep learning — mạng nơ-ron nhiều tầng tự học đặc trưng. Generative AI — sinh nội dung mới: văn bản, ảnh, code. LLM — model nền chuyên ngôn ngữ, tim của làn sóng hiện nay.",
      "confidence": 1.0,
      "status": "ready",
      "unique_user_count": 1,
      "question_count": 1,
      "representative_questions": [
        "bạn hãy giải thích giúp tôi sự giống và khác nhau của các tầng trí tuệ nhân tạo."
      ]
    },
    {
      "id": "insight-cluster-05",
      "topic": "Giải thích perceptron",
      "common_confusion": "Học viên yêu cầu giải thích perceptron, nhưng slide 11 không đề cập đến perceptron. Slide 11 nói về phân bố xác suất đầu ra của Transformer.",
      "correct_understanding": "Perceptron không được đề cập trong slide 11. Slide 11 giải thích rằng đầu ra của Transformer luôn là một phân bố xác suất trên toàn bộ từ vựng.",
      "source_pages": [
        11
      ],
      "source_excerpt": "Với mọi ngữ cảnh, model chấm điểm MỌI từ trong từ vựng — “land” 22%, “forest” 9%… — rồi chọn theo xác suất đó",
      "confidence": 0.4,
      "status": "needs_review",
      "unique_user_count": 1,
      "question_count": 1,
      "representative_questions": [
        "trong slide số 11 bạn hãy giài thích rõ về perceptrons"
      ]
    },
    {
      "id": "insight-cluster-06",
      "topic": "Phân biệt ML và DL",
      "common_confusion": "Học viên chưa rõ sự khác nhau giữa ML và DL, nhưng slide 18 không đề cập đến ML/DL. Slide 18 nói về quy trình tạo LLM (pre-training, SFT, RLHF, reasoning).",
      "correct_understanding": "ML và DL được phân biệt ở slide 3: ML học từ dữ liệu, DL là mạng nơ-ron nhiều tầng tự học đặc trưng. Slide 18 không nói về ML/DL.",
      "source_pages": [
        3
      ],
      "source_excerpt": "Machine learning — học từ dữ liệu thay vì viết luật tay. Deep learning — mạng nơ-ron nhiều tầng tự học đặc trưng.",
      "confidence": 0.5,
      "status": "needs_review",
      "unique_user_count": 1,
      "question_count": 1,
      "representative_questions": [
        "slide số 18: sự khác nhau giữa ML và DL chưa rõ lắm"
      ]
    },
    {
      "id": "insight-cluster-07",
      "topic": "Thông tin về Fei-Fei Li",
      "common_confusion": "Học viên hỏi về xuất thân của Fei-Fei Li, nhưng slide 20 không nói về Fei-Fei Li. Slide 20 nói về giới hạn của model. Fei-Fei Li được nhắc ở slide 7.",
      "correct_understanding": "Fei-Fei Li là nhà khoa học máy tính, người khởi xướng ImageNet. Bà không phải AI Engineer mà là nhà nghiên cứu học thuật.",
      "source_pages": [
        7
      ],
      "source_excerpt": "2009: Fei-Fei Li và ImageNet — cuộc cách mạng của dữ liệu. Trong khi cả ngành chạy theo thuật toán thông minh hơn, Fei-Fei Li chọn con đường khác: xây bộ dữ liệu lớn hơn — 14 triệu ảnh được gán nhãn tay, hơn 20.000 loại vật.",
      "confidence": 0.5,
      "status": "needs_review",
      "unique_user_count": 1,
      "question_count": 1,
      "representative_questions": [
        "feifei li xuất phát ban đầu không phải AI Engineer?"
      ]
    },
    {
      "id": "insight-cluster-09",
      "topic": "Giải thích khái niệm Learning rate",
      "common_confusion": "Học viên hỏi về learning rate, nhưng slide 2 không đề cập đến learning rate. Slide 2 là agenda.",
      "correct_understanding": "Learning rate không được đề cập trong slide 2. Khái niệm này có thể nằm trong các buổi khác hoặc kiến thức nền tảng về ML.",
      "source_pages": [
        2
      ],
      "source_excerpt": "AI IN ACTION - Day 1 Agenda • Bức tranh AI & các tầng của AI • Lịch sử AI 70 năm • Bên trong LLM: cơ chế vận hành • Từ LLM đến AI Agent • Landscape: model hôm nay & cuộc đua hiện tại • Chọn model & chi phí token • Gọi API lần đầu • Tổng kết — những ý để mang về",
      "confidence": 0.3,
      "status": "needs_review",
      "unique_user_count": 1,
      "question_count": 1,
      "representative_questions": [
        "Learning rate là gì? Giải thích ngắn gọn."
      ]
    },
    {
      "id": "insight-cluster-10",
      "topic": "Hỏi về người trong slide",
      "common_confusion": "Học viên hỏi 'đây là ai' khi tham chiếu slide 2, nhưng slide 2 không có hình ảnh người cụ thể.",
      "correct_understanding": "Slide 2 là agenda, không có hình ảnh người. Có thể học viên đã nhầm slide hoặc câu hỏi không rõ ràng.",
      "source_pages": [
        2
      ],
      "source_excerpt": "AI IN ACTION - Day 1 Agenda • Bức tranh AI & các tầng của AI • Lịch sử AI 70 năm • Bên trong LLM: cơ chế vận hành • Từ LLM đến AI Agent • Landscape: model hôm nay & cuộc đua hiện tại • Chọn model & chi phí token • Gọi API lần đầu • Tổng kết — những ý để mang về",
      "confidence": 0.2,
      "status": "needs_review",
      "unique_user_count": 1,
      "question_count": 1,
      "representative_questions": [
        "đây là ai"
      ]
    }
  ],
  "review_questions": [
    {
      "id": "question-01",
      "type": "multiple_choice",
      "question": "Theo slide, mối quan hệ giữa các tầng AI từ rộng đến hẹp là gì?",
      "options": [
        "AI → ML → DL → GenAI → LLM",
        "LLM → GenAI → DL → ML → AI",
        "AI → DL → ML → GenAI → LLM",
        "ML → AI → DL → LLM → GenAI"
      ],
      "correct_option": 0,
      "answer": "AI → ML → DL → GenAI → LLM",
      "explanation": "Slide 3 mô tả AI là chiếc ô lớn nhất, bên trong là ML, rồi DL, GenAI, và LLM là tầng hẹp nhất.",
      "source_pages": [
        3
      ],
      "source_excerpt": "AI — chiếc ô lớn nhất: mọi hệ thống có yếu tố “thông minh”. Machine learning — học từ dữ liệu thay vì viết luật tay. Deep learning — mạng nơ-ron nhiều tầng tự học đặc trưng. Generative AI — sinh nội dung mới: văn bản, ảnh, code. LLM — model nền chuyên ngôn ngữ, tim của làn sóng hiện nay.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "question-02",
      "type": "multiple_choice",
      "question": "Vì sao model AI có thể trả lời sai (hallucination) dù rất tự tin?",
      "options": [
        "Vì model được tối ưu để tạo ra câu trả lời nghe hợp lý, không phải để tra cứu sự thật.",
        "Vì model bị lỗi phần cứng.",
        "Vì dữ liệu huấn luyện quá ít.",
        "Vì model không có khả năng học."
      ],
      "correct_option": 0,
      "answer": "Vì model được tối ưu để tạo ra câu trả lời nghe hợp lý, không phải để tra cứu sự thật.",
      "explanation": "Slide 20 giải thích: 'Model tối ưu cho câu nghe hợp lý, không phải tra sự thật — nên có thể tự tin mà sai (hallucination).'",
      "source_pages": [
        20
      ],
      "source_excerpt": "Model tối ưu cho câu nghe hợp lý, không phải tra sự thật — nên có thể tự tin mà sai (hallucination).",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "question-03",
      "type": "multiple_choice",
      "question": "Sự kiện nào được coi là bước ngoặt đưa Transformer trở thành nền tảng cho các LLM sau này?",
      "options": [
        "Transformer cho phép mỗi từ nhìn sang các từ quan trọng khác trong cả câu, thay vì đọc tuần tự.",
        "Transformer sử dụng mạng nơ-ron tích chập (CNN).",
        "Transformer chỉ hoạt động với tiếng Anh.",
        "Transformer không cần dữ liệu huấn luyện."
      ],
      "correct_option": 0,
      "answer": "Transformer cho phép mỗi từ nhìn sang các từ quan trọng khác trong cả câu, thay vì đọc tuần tự.",
      "explanation": "Slide 8 nêu: 'Transformer là bước ngoặt vì nó cho mô hình hiểu ngôn ngữ theo cách linh hoạt hơn: mỗi từ có thể nhìn sang những từ quan trọng khác trong cả câu, thay vì chỉ đi tuần tự từng bước.'",
      "source_pages": [
        8
      ],
      "source_excerpt": "Transformer là bước ngoặt vì nó cho mô hình hiểu ngôn ngữ theo cách linh hoạt hơn: mỗi từ có thể nhìn sang những từ quan trọng khác trong cả câu, thay vì chỉ đi tuần tự từng bước → trở thành nền móng kỹ thuật cho GPT, BERT và toàn bộ làn sóng LLM sau đó.",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "question-04",
      "type": "multiple_choice",
      "question": "Khi temperature = 0, model sẽ chọn từ như thế nào?",
      "options": [
        "Luôn chọn từ có xác suất cao nhất.",
        "Chọn từ ngẫu nhiên hoàn toàn.",
        "Chọn từ có xác suất thấp nhất.",
        "Không chọn từ nào."
      ],
      "correct_option": 0,
      "answer": "Luôn chọn từ có xác suất cao nhất.",
      "explanation": "Slide 29 giải thích: 'T=0 luôn chọn từ chắc nhất' (từ có xác suất cao nhất).",
      "source_pages": [
        29
      ],
      "source_excerpt": "T=0 luôn chọn từ chắc nhất",
      "confidence": 1.0,
      "status": "ready"
    },
    {
      "id": "question-05",
      "type": "multiple_choice",
      "question": "Theo slide, agent khác LLM trần ở điểm nào?",
      "options": [
        "Agent có khả năng lập kế hoạch, dùng công cụ và hành động, còn LLM trần chỉ suy luận.",
        "Agent là một loại model khác hoàn toàn.",
        "Agent không cần LLM.",
        "Agent chỉ hoạt động với dữ liệu cũ."
      ],
      "correct_option": 0,
      "answer": "Agent có khả năng lập kế hoạch, dùng công cụ và hành động, còn LLM trần chỉ suy luận.",
      "explanation": "Slide 23 và 24 giải thích agent là LLM được đặt vào vòng làm việc có mục tiêu và hành động, với các mức độ từ Level 0 (LLM trần) đến Level 3 (đội agent phối hợp).",
      "source_pages": [
        23,
        24
      ],
      "source_excerpt": "Agent không phải “một loại model khác” — đó là LLM được đặt vào vòng làm việc có mục tiêu và hành động. Agent = Goal + Reasoning + Tools + Memory + Action — chạy thành vòng lặp cho tới khi xong việc.",
      "confidence": 1.0,
      "status": "ready"
    }
  ],
  "warnings": [
    {
      "code": "LOW_CONFIDENCE_SCORE",
      "message": "insight 'insight-cluster-05' chưa xác minh chắc chắn với slide (grounded=True, confidence=0.4), cần Lab Coach duyệt.",
      "item_ids": [
        "insight-cluster-05"
      ]
    },
    {
      "code": "LOW_CONFIDENCE_SCORE",
      "message": "insight 'insight-cluster-06' chưa xác minh chắc chắn với slide (grounded=True, confidence=0.5), cần Lab Coach duyệt.",
      "item_ids": [
        "insight-cluster-06"
      ]
    },
    {
      "code": "LOW_CONFIDENCE_SCORE",
      "message": "insight 'insight-cluster-07' chưa xác minh chắc chắn với slide (grounded=True, confidence=0.5), cần Lab Coach duyệt.",
      "item_ids": [
        "insight-cluster-07"
      ]
    },
    {
      "code": "LOW_CONFIDENCE_SCORE",
      "message": "insight 'insight-cluster-09' chưa xác minh chắc chắn với slide (grounded=True, confidence=0.3), cần Lab Coach duyệt.",
      "item_ids": [
        "insight-cluster-09"
      ]
    },
    {
      "code": "LOW_CONFIDENCE_SCORE",
      "message": "insight 'insight-cluster-10' chưa xác minh chắc chắn với slide (grounded=True, confidence=0.2), cần Lab Coach duyệt.",
      "item_ids": [
        "insight-cluster-10"
      ]
    }
  ],
  "generated_at": "2026-07-30T08:47:12.329033Z"
};
