// Progress Steps 드래그 스크롤 기능
document.addEventListener('DOMContentLoaded', function() {
  const progressSteps = document.querySelector('.progress-steps');
  if (!progressSteps) return;

  let isDown = false;
  let startX;
  let scrollLeft;
  let isDragged = false;

  progressSteps.addEventListener('mousedown', (e) => {
    isDown = true;
    isDragged = false;
    startX = e.pageX - progressSteps.offsetLeft;
    scrollLeft = progressSteps.scrollLeft;
    progressSteps.style.cursor = 'grabbing';
    progressSteps.style.userSelect = 'none';
  });

  progressSteps.addEventListener('mouseleave', () => {
    isDown = false;
    progressSteps.style.cursor = 'grab';
  });

  progressSteps.addEventListener('mouseup', () => {
    isDown = false;
    progressSteps.style.cursor = 'grab';
  });

  progressSteps.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    
    const x = e.pageX - progressSteps.offsetLeft;
    const walk = (x - startX) * 1;
    
    if (Math.abs(walk) > 3) {
      isDragged = true;
    }
    
    progressSteps.scrollLeft = scrollLeft - walk;
  });

  progressSteps.addEventListener('click', (e) => {
    if (isDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 진행 단계 클릭 시 해당 섹션으로 스크롤
  document.querySelectorAll('.progress-step').forEach(step => {
    step.addEventListener('click', function(e) {
      if (isDragged) return;
      
      const stepNumber = this.id.replace('step', '');
      const sectionId = `step${stepNumber}-section`;
      scrollToSection(sectionId);
    });
  });

  // MutationObserver로 active 클래스 변경 감지
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('active')) {
          setTimeout(scrollToActiveStep, 100);
        }
      }
    });
  });

  progressSteps.querySelectorAll('.progress-step').forEach(step => {
    observer.observe(step, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  setTimeout(scrollToActiveStep, 100);
});

// 페이지 로드 시 자동 실행
window.addEventListener('DOMContentLoaded', () => {
  console.log('페이지 로드 완료');
  
  // 스크롤 효과 (그림자 강조)
  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const progressTracker = document.querySelector('.progress-tracker');
    
    if (progressTracker) {
      if (scrollTop > 50) {
        progressTracker.classList.add('scrolled');
      } else {
        progressTracker.classList.remove('scrolled');
      }
    }
  });
});
